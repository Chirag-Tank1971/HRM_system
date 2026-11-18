import crypto from 'crypto';
import { getDbCollection } from '../db.js';
import type { User, UserRole } from '../../src/types/index.js';

/**
 * Approvals engine.
 *
 * One engine for every request that needs sign-off (leave, attendance corrections, expense
 * claims, profile changes, resignations...). A module:
 *   1. registers a handler for its request type (what to do when approved / rejected / cancelled),
 *   2. calls startWorkflow() when a request is raised.
 * The engine works out who approves each step, tracks decisions, notifies people, and feeds
 * the single approvals inbox.
 */
export type ApproverType = 'REPORTING_MANAGER' | 'HOD' | 'HR' | 'ROLE' | 'SPECIFIC_USER';
export type WorkflowStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type StepStatus = 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';

export interface WorkflowStepDefinition {
  approverType: ApproverType;
  /** Role name for ROLE, user id for SPECIFIC_USER. */
  ref?: string;
  /** Step applies only when context[field] >= value (e.g. { field: 'days', gte: 5 }). */
  when?: { field: string; gte: number };
}

export interface WorkflowStep {
  order: number;
  approverType: ApproverType;
  approverIds: string[];
  approverNames: string[];
  status: StepStatus;
  actedBy?: string;
  actedByName?: string;
  actedAt?: string;
  comment?: string;
  /** True when HR or an admin decided on behalf of the named approver. */
  override?: boolean;
}

export interface WorkflowInstance {
  id: string;
  requestType: string;
  requestId: string;
  title: string;
  summary: string;
  requesterUserId: string;
  requesterEmployeeId?: string;
  /** The account of the person the request is about (differs from the requester when HR applies on someone's behalf). */
  subjectUserId?: string;
  requesterName: string;
  status: WorkflowStatus;
  currentStep: number;
  steps: WorkflowStep[];
  /** User ids who can act right now; empty once the workflow is closed. Indexed for the inbox. */
  pendingApproverIds: string[];
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface WorkflowHandler {
  onApproved?: (instance: WorkflowInstance) => Promise<void>;
  onRejected?: (instance: WorkflowInstance) => Promise<void>;
  onCancelled?: (instance: WorkflowInstance) => Promise<void>;
}

const handlers = new Map<string, WorkflowHandler>();

export function registerWorkflowHandler(requestType: string, handler: WorkflowHandler): void {
  handlers.set(requestType, handler);
}

/** Built-in approval chains, used until a company saves its own for a request type. */
const DEFAULT_DEFINITIONS: Record<string, WorkflowStepDefinition[]> = {
  LEAVE: [{ approverType: 'REPORTING_MANAGER' }],
  ATTENDANCE_REGULARISATION: [{ approverType: 'REPORTING_MANAGER' }],
  PROFILE_CHANGE: [{ approverType: 'HR' }],
};
const FALLBACK_DEFINITION: WorkflowStepDefinition[] = [{ approverType: 'REPORTING_MANAGER' }];

const APPROVER_TYPES: ApproverType[] = ['REPORTING_MANAGER', 'HOD', 'HR', 'ROLE', 'SPECIFIC_USER'];

export function validateStepDefinitions(steps: unknown): WorkflowStepDefinition[] {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 6) {
    throw new Error('An approval chain needs between 1 and 6 steps.');
  }
  return steps.map((raw: any, i) => {
    if (!APPROVER_TYPES.includes(raw?.approverType)) throw new Error(`Step ${i + 1}: unknown approver type.`);
    if ((raw.approverType === 'ROLE' || raw.approverType === 'SPECIFIC_USER') && !raw.ref) {
      throw new Error(`Step ${i + 1}: choose who approves this step.`);
    }
    const step: WorkflowStepDefinition = { approverType: raw.approverType };
    if (raw.ref) step.ref = String(raw.ref);
    if (raw.when && typeof raw.when.field === 'string' && Number.isFinite(Number(raw.when.gte))) {
      step.when = { field: raw.when.field, gte: Number(raw.when.gte) };
    }
    return step;
  });
}

export async function getWorkflowDefinition(requestType: string): Promise<WorkflowStepDefinition[]> {
  const saved = await getDbCollection('workflowDefinitions').findOne({ requestType });
  if (saved?.steps?.length) return saved.steps;
  return DEFAULT_DEFINITIONS[requestType] || FALLBACK_DEFINITION;
}

export async function saveWorkflowDefinition(requestType: string, steps: WorkflowStepDefinition[], actorId: string): Promise<void> {
  const col = getDbCollection('workflowDefinitions');
  const now = new Date().toISOString();
  const existing = await col.findOne({ requestType });
  if (existing) {
    await col.updateOne({ requestType }, { $set: { steps, updatedBy: actorId, updatedAt: now } });
  } else {
    await col.insertOne({ id: `wfd_${crypto.randomBytes(6).toString('hex')}`, requestType, steps, updatedBy: actorId, createdAt: now, updatedAt: now });
  }
}

type Approver = { id: string; name: string };

async function activeUsers(filter: Record<string, unknown>): Promise<Approver[]> {
  const users: User[] = await (await getDbCollection('users').find({ ...filter, active: { $ne: false } })).toArray();
  return users.map((u) => ({ id: u.id, name: u.name }));
}

async function resolveApprovers(step: WorkflowStepDefinition, employee: any | null): Promise<Approver[]> {
  switch (step.approverType) {
    case 'REPORTING_MANAGER': {
      const managerEmpIds: string[] = [employee?.managerId, ...(employee?.managerIds || [])].filter(Boolean);
      if (!managerEmpIds.length) return [];
      return activeUsers({ employeeId: { $in: [...new Set(managerEmpIds)] } });
    }
    case 'HOD':
      return employee?.hodId ? activeUsers({ employeeId: employee.hodId }) : [];
    case 'HR':
      return activeUsers({ role: 'HR' });
    case 'ROLE':
      return activeUsers({ role: step.ref as UserRole });
    case 'SPECIFIC_USER':
      return activeUsers({ id: step.ref });
  }
}

/**
 * Approvers for a step, never including the requester. When a step resolves to nobody (no
 * manager set, or the requester is their own manager) it falls back to HR, then to Super
 * Admins, so a request can never be stuck with no one able to decide it.
 */
async function approversFor(step: WorkflowStepDefinition, employee: any | null, excludedUserIds: string[]): Promise<Approver[]> {
  // Neither the person who raised the request nor the person it is about may approve it.
  const notRequester = (list: Approver[]) => list.filter((a) => !excludedUserIds.includes(a.id));
  let found = notRequester(await resolveApprovers(step, employee));
  if (!found.length && step.approverType !== 'HR') found = notRequester(await activeUsers({ role: 'HR' }));
  if (!found.length) found = notRequester(await activeUsers({ role: 'SUPER_ADMIN' }));
  return found;
}

async function notify(userIds: string[], title: string, message: string, instance: WorkflowInstance, priority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM') {
  const col = getDbCollection('notifications');
  const now = new Date().toISOString();
  for (const userId of [...new Set(userIds)]) {
    try {
      await col.insertOne({
        id: `ntf_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        type: 'APPROVAL',
        title,
        message,
        isRead: false,
        priority,
        metadata: { workflowInstanceId: instance.id, requestType: instance.requestType, requestId: instance.requestId, view: 'approvals' },
        createdAt: now,
      });
    } catch (err) {
      console.error('[Workflow] Could not write notification:', err);
    }
  }
}

export interface StartWorkflowInput {
  requestType: string;
  requestId: string;
  title: string;
  summary: string;
  requester: Pick<User, 'id' | 'name' | 'employeeId'>;
  /** Values that step conditions can test, e.g. { days: 3 } or { amount: 12000 }. */
  context?: Record<string, unknown>;
}

export async function startWorkflow(input: StartWorkflowInput): Promise<WorkflowInstance> {
  const definition = await getWorkflowDefinition(input.requestType);
  const context = input.context || {};
  const employee = input.requester.employeeId
    ? await getDbCollection('employees').findOne({ id: input.requester.employeeId })
    : null;
  const subjectUser: User | null = input.requester.employeeId
    ? await getDbCollection('users').findOne({ employeeId: input.requester.employeeId })
    : null;
  const excluded = [input.requester.id, subjectUser?.id].filter((x): x is string => Boolean(x));

  const applicable = definition.filter((s) => !s.when || Number(context[s.when.field]) >= s.when.gte);
  const stepDefs = applicable.length ? applicable : definition.slice(0, 1);

  const steps: WorkflowStep[] = [];
  for (const [i, def] of stepDefs.entries()) {
    const approvers = await approversFor(def, employee, excluded);
    steps.push({
      order: i,
      approverType: def.approverType,
      approverIds: approvers.map((a) => a.id),
      approverNames: approvers.map((a) => a.name),
      status: i === 0 ? 'PENDING' : 'WAITING',
    });
  }
  if (!steps[0]?.approverIds.length) {
    throw new Error('No approver is available for this request. Ask HR to assign a reporting manager.');
  }

  const now = new Date().toISOString();
  const instance: WorkflowInstance = {
    id: `wfi_${crypto.randomBytes(8).toString('hex')}`,
    requestType: input.requestType,
    requestId: input.requestId,
    title: input.title,
    summary: input.summary,
    requesterUserId: input.requester.id,
    requesterEmployeeId: input.requester.employeeId,
    subjectUserId: subjectUser?.id,
    requesterName: input.requester.name,
    status: 'PENDING',
    currentStep: 0,
    steps,
    pendingApproverIds: steps[0].approverIds,
    context,
    createdAt: now,
    updatedAt: now,
  };
  await getDbCollection('workflowInstances').insertOne(instance);
  await notify(steps[0].approverIds, `Approval needed: ${input.title}`, `${input.requester.name} · ${input.summary}`, instance, 'HIGH');
  return instance;
}

async function save(instance: WorkflowInstance): Promise<void> {
  const { id, ...rest } = instance;
  await getDbCollection('workflowInstances').updateOne({ id }, { $set: rest });
}

async function close(instance: WorkflowInstance, status: Exclude<WorkflowStatus, 'PENDING'>): Promise<void> {
  const now = new Date().toISOString();
  instance.status = status;
  instance.pendingApproverIds = [];
  instance.updatedAt = now;
  instance.closedAt = now;
  for (const step of instance.steps) {
    if (step.status === 'PENDING' || step.status === 'WAITING') step.status = 'SKIPPED';
  }
  await save(instance);
}

export class WorkflowError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

const OVERRIDE_ROLES: UserRole[] = ['SUPER_ADMIN', 'HR'];

/** Records an approver's decision and advances or closes the workflow. */
export async function decideWorkflow(
  instanceId: string,
  actor: Pick<User, 'id' | 'name' | 'role' | 'employeeId'>,
  decision: 'APPROVE' | 'REJECT',
  comment?: string
): Promise<WorkflowInstance> {
  const instance: WorkflowInstance | null = await getDbCollection('workflowInstances').findOne({ id: instanceId });
  if (!instance) throw new WorkflowError('Request not found.', 404);
  if (instance.status !== 'PENDING') throw new WorkflowError(`This request is already ${instance.status.toLowerCase()}.`, 409);
  const isOwn =
    instance.requesterUserId === actor.id ||
    instance.subjectUserId === actor.id ||
    (!!actor.employeeId && actor.employeeId === instance.requesterEmployeeId);
  if (isOwn) throw new WorkflowError('You cannot decide your own request.', 403);

  const isNamedApprover = instance.pendingApproverIds.includes(actor.id);
  const isOverride = !isNamedApprover && OVERRIDE_ROLES.includes(actor.role);
  if (!isNamedApprover && !isOverride) throw new WorkflowError('You are not an approver for this request.', 403);

  const note = String(comment ?? '').trim().slice(0, 1000);
  if (decision === 'REJECT' && !note) throw new WorkflowError('Give a reason for rejecting this request.');

  const now = new Date().toISOString();
  const step = instance.steps[instance.currentStep];
  step.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  step.actedBy = actor.id;
  step.actedByName = actor.name;
  step.actedAt = now;
  step.comment = note;
  if (isOverride) step.override = true;

  const handler = handlers.get(instance.requestType);

  if (decision === 'REJECT') {
    await close(instance, 'REJECTED');
    await handler?.onRejected?.(instance);
    await notify([instance.requesterUserId], `Rejected: ${instance.title}`, `${actor.name} rejected your request. Reason: ${note}`, instance);
    return instance;
  }

  const next = instance.steps[instance.currentStep + 1];
  if (next) {
    next.status = 'PENDING';
    instance.currentStep += 1;
    instance.pendingApproverIds = next.approverIds;
    instance.updatedAt = now;
    await save(instance);
    await notify(next.approverIds, `Approval needed: ${instance.title}`, `${instance.requesterName} · ${instance.summary}`, instance, 'HIGH');
    return instance;
  }

  await close(instance, 'APPROVED');
  await handler?.onApproved?.(instance);
  await notify([instance.requesterUserId], `Approved: ${instance.title}`, `${actor.name} approved your request.`, instance);
  return instance;
}

/** Withdraws a pending request. Only the requester (or HR / Super Admin) may do this. */
export async function cancelWorkflow(requestType: string, requestId: string, actor: Pick<User, 'id' | 'role'>): Promise<WorkflowInstance | null> {
  const instance: WorkflowInstance | null = await getDbCollection('workflowInstances').findOne({ requestType, requestId, status: 'PENDING' });
  if (!instance) return null;
  if (instance.requesterUserId !== actor.id && !OVERRIDE_ROLES.includes(actor.role)) {
    throw new WorkflowError('Only the person who raised this request can withdraw it.', 403);
  }
  const approvers = instance.pendingApproverIds;
  await close(instance, 'CANCELLED');
  await handlers.get(requestType)?.onCancelled?.(instance);
  await notify(approvers, `Withdrawn: ${instance.title}`, `${instance.requesterName} withdrew this request.`, instance, 'LOW');
  return instance;
}

export async function listPendingFor(userId: string): Promise<WorkflowInstance[]> {
  return (await getDbCollection('workflowInstances').find({ status: 'PENDING', pendingApproverIds: userId }))
    .sort({ createdAt: 1 })
    .toArray();
}

export async function listRaisedBy(userId: string, limit = 50): Promise<WorkflowInstance[]> {
  return (await getDbCollection('workflowInstances').find({ requesterUserId: userId }))
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function listDecidedBy(userId: string, limit = 50): Promise<WorkflowInstance[]> {
  const all: WorkflowInstance[] = await (await getDbCollection('workflowInstances').find({ status: { $ne: 'PENDING' } }))
    .sort({ updatedAt: -1 })
    .limit(500)
    .toArray();
  return all.filter((w) => w.steps.some((s) => s.actedBy === userId)).slice(0, limit);
}
