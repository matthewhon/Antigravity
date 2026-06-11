import React, { useState, useEffect } from 'react';
import { WidgetWrapper } from '../SharedUI';
import { useTenantData } from '../../contexts/TenantDataContext';
import { db } from '../../services/firebase';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export const OnboardingTaskWidget = ({ onRemove }: { onRemove?: () => void }) => {
  const { church, user } = useTenantData();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([
    { id: 'pco', label: 'Connect To Planning Center', completed: false, view: '/settings' },
    { id: 'users', label: 'Create users and roles', completed: false, view: '/settings' },
    { id: 'sms', label: 'Set up SMS', completed: false, view: '/settings' },
    { id: 'email', label: 'Set up email', completed: false, view: '/settings' },
    { id: 'budget', label: 'Set up budget on Giving', completed: false, view: '/giving/budgets' },
    { id: 'community', label: 'Choose community locations', completed: false, view: '/settings' },
    { id: 'risk', label: 'Configure Risk profiles', completed: false, view: '/settings' },
    { id: 'webhooks', label: 'Configure PCO Webhooks', completed: false, view: '/settings' },
    { id: 'workflows', label: 'Set up an SMS Workflow', completed: false, view: '/tools/workflows' }
  ]);

  useEffect(() => {
    if (!church || !db) return;

    const checkTasks = async () => {
      let usersCount = 0;
      let smsCount = 0;
      let budgetCount = 0;
      let workflowsCount = 0;
      let webhooksCount = 0;

      try {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('churchId', '==', church.id)));
        usersCount = usersSnap.size;
        
        const smsSnap = await getDocs(query(collection(db, 'twilioNumbers'), where('churchId', '==', church.id)));
        smsCount = smsSnap.size;

        const budgetsSnap = await getDocs(query(collection(db, 'budgets'), where('churchId', '==', church.id)));
        budgetCount = budgetsSnap.size;

        const wfSnap = await getDocs(query(collection(db, 'smsWorkflows'), where('churchId', '==', church.id)));
        workflowsCount = wfSnap.size;

        const whSnap = await getDocs(query(collection(db, 'system_settings'), where('id', '==', 'pco_webhooks')));
        webhooksCount = whSnap.size; 
      } catch (e) {
        console.error('Error fetching onboarding state:', e);
      }

      setTasks(prev => prev.map(t => {
        switch(t.id) {
          case 'pco': return { ...t, completed: !!church.pco_access_token };
          case 'users': return { ...t, completed: usersCount > 1 };
          case 'sms': return { ...t, completed: smsCount > 0 || !!church.twilioNumber };
          case 'email': return { ...t, completed: !!(church.emailSettings?.postmarkServerToken || church.emailSettings?.sendGridSubuserId) };
          case 'budget': return { ...t, completed: budgetCount > 0 };
          case 'community': return { ...t, completed: Array.isArray(church.locations) && church.locations.length > 0 };
          case 'risk': return { ...t, completed: !!(church.riskSettings || church.groupRiskSettings || church.churchRiskSettings) };
          case 'webhooks': return { ...t, completed: webhooksCount > 0 };
          case 'workflows': return { ...t, completed: workflowsCount > 0 };
          default: return t;
        }
      }));
      setLoading(false);
    };

    checkTasks();
  }, [church, db]);

  const handleTaskClick = (task: any) => {
    if (task.view) {
      navigate(task.view);
    }
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  if (church?.subscription?.status === 'active' || progressPercent === 100) {
    return null;
  }

  if (loading) {
    return (
      <WidgetWrapper title="Setup Guide" onRemove={onRemove} source="Onboarding">
        <div className="p-8 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </WidgetWrapper>
    );
  }

  return (
    <WidgetWrapper title="Setup Guide" onRemove={onRemove} source="Onboarding">
      <div className="p-5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="mb-5">
          <div className="flex justify-between text-[11px] font-black uppercase text-slate-500 tracking-wider mb-2">
            <span>Onboarding Progress</span>
            <span className="text-indigo-600 dark:text-indigo-400">{progressPercent}%</span>
          </div>
          <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="space-y-2">
          {tasks.map(task => (
            <div 
              key={task.id}
              onClick={() => handleTaskClick(task)}
              className="flex items-center justify-between p-3.5 bg-white dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-850 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3.5">
                {task.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 dark:text-slate-700 group-hover:text-indigo-400 shrink-0 transition-colors" />
                )}
                <span className={`text-sm font-semibold transition-colors ${task.completed ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
                  {task.label}
                </span>
              </div>
              {!task.completed && (
                <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors" />
              )}
            </div>
          ))}
        </div>
      </div>
    </WidgetWrapper>
  );
};
