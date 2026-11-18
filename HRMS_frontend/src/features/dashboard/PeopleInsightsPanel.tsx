import React, { useEffect, useState } from 'react';
import { getDashboardInsights, type DashboardInsights } from '../../services/hrApi';
import { useAuth } from '../../context/AuthContext';
import { isViewPermitted, type AppView } from '../../hooks/useUrlHashView';
import type { Navigate } from '../../components/dashboard/DashboardKit';
import { LeaveSection, UpcomingCard, WorkforceSection } from './sections';

/**
 * Live workforce and leave figures for pages outside the main dashboard (the executive
 * Organisation overview). Loads its own data and only links to pages the viewer can open.
 */
export const PeopleInsightsPanel: React.FC<{ onNavigate?: (view: string) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [insights, setInsights] = useState<DashboardInsights | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardInsights()
      .then((d) => !cancelled && setInsights(d))
      .catch(() => undefined); // the rest of the page still works without these figures
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!insights?.workforce) return null;

  const navigate: Navigate = (view) => {
    if (onNavigate && isViewPermitted(view as AppView, user?.role)) onNavigate(view);
  };

  return (
    <div className="space-y-4">
      <WorkforceSection insights={insights} onNavigate={navigate} />
      <LeaveSection insights={insights} onNavigate={navigate} />
      <UpcomingCard insights={insights} onNavigate={navigate} />
    </div>
  );
};
