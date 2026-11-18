import React from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import type { User } from '../../types';
import { LeaveCalendarTab } from '../leave/LeaveCalendarTab';

interface CalendarViewProps {
  currentUser: User | null;
}

/** The company calendar: holidays, restricted holidays, weekly-offs and who is on leave. */
export const CalendarView: React.FC<CalendarViewProps> = ({ currentUser }) => (
  <div className="space-y-5">
    <PageHeader
      title="Calendar"
      description="Holidays, restricted holidays, weekly-offs and leave, month by month. Select a day to see its details."
    />
    <LeaveCalendarTab myEmployeeId={currentUser?.employeeId} />
  </div>
);
