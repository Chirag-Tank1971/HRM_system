import express, { Response } from 'express';
import { authenticateToken, requireRoles, AuthenticatedRequest } from '../auth.js';
import {
  decideWorkflow,
  getWorkflowDefinition,
  listDecidedBy,
  listPendingFor,
  listRaisedBy,
  saveWorkflowDefinition,
  validateStepDefinitions,
  WorkflowError,
} from '../core/workflow.js';

/**
 * The single approvals inbox, shared by every module that raises requests.
 */
export const approvalRouter = express.Router();
approvalRouter.use(['/approvals', '/workflows'], authenticateToken);

function fail(res: Response, err: unknown, fallback: string) {
  if (err instanceof WorkflowError) return res.status(err.status).json({ error: err.message });
  console.error(`[Approvals] ${fallback}`, err);
  return res.status(500).json({ error: fallback });
}

/** GET /api/approvals?tab=pending|mine|history */
approvalRouter.get('/approvals', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tab = String(req.query.tab || 'pending');
    const userId = req.user!.id;
    if (tab === 'mine') return res.json(await listRaisedBy(userId));
    if (tab === 'history') return res.json(await listDecidedBy(userId));
    res.json(await listPendingFor(userId));
  } catch (err) {
    fail(res, err, 'Failed to load approvals.');
  }
});

/** GET /api/approvals/count — number waiting on the signed-in user (for the nav badge). */
approvalRouter.get('/approvals/count', async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ pending: (await listPendingFor(req.user!.id)).length });
  } catch (err) {
    fail(res, err, 'Failed to count approvals.');
  }
});

for (const [path, decision] of [['approve', 'APPROVE'], ['reject', 'REJECT']] as const) {
  approvalRouter.post(`/approvals/:id/${path}`, async (req: AuthenticatedRequest, res: Response) => {
    try {
      res.json(await decideWorkflow(req.params.id, req.user!, decision, req.body?.comment));
    } catch (err) {
      fail(res, err, 'Failed to record your decision.');
    }
  });
}

/** POST /api/approvals/bulk — { ids, decision, comment } */
approvalRouter.post('/approvals/bulk', async (req: AuthenticatedRequest, res: Response) => {
  const ids: unknown = req.body?.ids;
  const decision = req.body?.decision === 'REJECT' ? 'REJECT' : req.body?.decision === 'APPROVE' ? 'APPROVE' : null;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !decision) {
    return res.status(400).json({ error: 'Provide up to 100 request ids and a decision.' });
  }
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids.map(String)) {
    try {
      await decideWorkflow(id, req.user!, decision, req.body?.comment);
      results.push({ id, ok: true });
    } catch (err: any) {
      results.push({ id, ok: false, error: err instanceof WorkflowError ? err.message : 'Failed' });
    }
  }
  res.json({ results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
});

/** GET /api/workflows/:requestType — the approval chain in force for a request type. */
approvalRouter.get('/workflows/:requestType', requireRoles('SUPER_ADMIN', 'HR'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ requestType: req.params.requestType, steps: await getWorkflowDefinition(req.params.requestType) });
  } catch (err) {
    fail(res, err, 'Failed to load the approval chain.');
  }
});

/** PUT /api/workflows/:requestType — Super Admin sets the approval chain. */
approvalRouter.put('/workflows/:requestType', requireRoles('SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const steps = validateStepDefinitions(req.body?.steps);
    await saveWorkflowDefinition(req.params.requestType, steps, req.user!.id);
    res.json({ requestType: req.params.requestType, steps });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Invalid approval chain.' });
  }
});
