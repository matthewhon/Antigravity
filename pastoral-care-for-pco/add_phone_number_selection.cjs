const fs = require('fs');
const filePath = 'components/MessagingModule.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add twilioNumbers to WorkflowEditor props
let replacedProps = false;
content = content.replace(
    /pcoRegistrationEvents: \{ id: string; pcoId: string; name: string; startsAt\?: string \| null \}\[\];\s*onSave: \(wf: SmsWorkflow\) => Promise<void>;/,
    (match) => {
        replacedProps = true;
        return 'pcoRegistrationEvents: { id: string; pcoId: string; name: string; startsAt?: string | null }[];\n    twilioNumbers: TwilioPhoneNumber[];\n    onSave: (wf: SmsWorkflow) => Promise<void>;';
    }
);

// 2. Add twilioNumbers to WorkflowEditor destructuring
let replacedDestruct = false;
content = content.replace(
    /\}\> = \(\{ initial, churchId, keywords, pcoLists, pcoGroups, smsTags, pcoRegistrationEvents, onSave, onBack, isBusy \}\) => \{/,
    (match) => {
        replacedDestruct = true;
        return '}> = ({ initial, churchId, keywords, pcoLists, pcoGroups, smsTags, pcoRegistrationEvents, twilioNumbers, onSave, onBack, isBusy }) => {';
    }
);

// 3. Add twilioNumberId: null to makeBlank
let replacedMakeBlank = false;
content = content.replace(
    /description: '',\s*trigger: 'manual',/,
    (match) => {
        replacedMakeBlank = true;
        return 'description: \'\',\n        twilioNumberId: null,\n        trigger: \'manual\',';
    }
);

// 4. Add the select box for Sending Phone Number below Description
let replacedSelect = false;
content = content.replace(
    /<\/textarea>\s*<\/div>\s*<\/div>\s*\{\/\* Trigger \*\/\}/,
    (match) => {
        replacedSelect = true;
        return '</textarea>\n                        </div>\n                        <div>\n                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Sending Phone Number</label>\n                            <select\n                                value={wf.twilioNumberId || \'\'}\n                                onChange={e => patch({ twilioNumberId: e.target.value || null })}\n                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"\n                            >\n                                <option value="">(Default Church Number)</option>\n                                {twilioNumbers.map(num => (\n                                    <option key={num.id} value={num.id}>{num.friendlyLabel} ({num.phoneNumber})</option>\n                                ))}\n                            </select>\n                            <p className="text-[10px] text-slate-400 mt-1">If set, all steps in this workflow will be sent from this specific number instead of your church\'s default number.</p>\n                        </div>\n                    </div>\n\n                    {/* Trigger */}';
    }
);

// 5. Add useTwilioNumbers to SmsWorkflowsManager
let replacedManagerHook = false;
content = content.replace(
    /export const SmsWorkflowsManager: React\.FC<\{ churchId: string \}> = \(\{ churchId \}\) => \{\s*const \[workflows, setWorkflows\] = useState<SmsWorkflow\[\]>\(\[\]\);/,
    (match) => {
        replacedManagerHook = true;
        return 'export const SmsWorkflowsManager: React.FC<{ churchId: string }> = ({ churchId }) => {\n    const { numbers: twilioNumbers } = useTwilioNumbers(churchId);\n    const [workflows, setWorkflows] = useState<SmsWorkflow[]>([]);';
    }
);

// 6. Pass twilioNumbers to WorkflowEditor instantiation
let replacedInstantiation = false;
content = content.replace(
    /pcoRegistrationEvents=\{pcoRegistrationEvents\}\s*onSave=\{handleSave\}/,
    (match) => {
        replacedInstantiation = true;
        return 'pcoRegistrationEvents={pcoRegistrationEvents}\n                    twilioNumbers={twilioNumbers}\n                    onSave={handleSave}';
    }
);

fs.writeFileSync(filePath, content, 'utf8');
console.log(JSON.stringify({ replacedProps, replacedDestruct, replacedMakeBlank, replacedSelect, replacedManagerHook, replacedInstantiation }));
