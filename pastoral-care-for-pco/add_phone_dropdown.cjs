const fs = require('fs');
const filePath = 'components/MessagingModule.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `                            />
                        </div>
                    </div>

                    {/* Trigger */}`;

const replaceStr = `                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Sending Phone Number</label>
                            <select
                                value={wf.twilioNumberId || ''}
                                onChange={e => patch({ twilioNumberId: e.target.value || null })}
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="">(Default Church Number)</option>
                                {twilioNumbers.map(num => (
                                    <option key={num.id} value={num.id}>{num.friendlyLabel} ({num.phoneNumber})</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1">If set, all steps in this workflow will be sent from this specific number instead of your church's default number.</p>
                        </div>
                    </div>

                    {/* Trigger */}`;

const newContent = content.replace(targetStr, replaceStr);
if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Success! (exact match)');
} else {
    // try regex with flex whitespace
    const regex = /<\/textarea>[\s\n]*<\/div>[\s\n]*<\/div>[\s\n]*\{\/\* Trigger \*\/\}/;
    const regexReplaceStr = `</textarea>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Sending Phone Number</label>
                            <select
                                value={wf.twilioNumberId || ''}
                                onChange={e => patch({ twilioNumberId: e.target.value || null })}
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="">(Default Church Number)</option>
                                {twilioNumbers.map(num => (
                                    <option key={num.id} value={num.id}>{num.friendlyLabel} ({num.phoneNumber})</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1">If set, all steps in this workflow will be sent from this specific number instead of your church's default number.</p>
                        </div>
                    </div>

                    {/* Trigger */}`;
    const newContent2 = content.replace(regex, regexReplaceStr);
    if (newContent2 !== content) {
        fs.writeFileSync(filePath, newContent2, 'utf8');
        console.log('Success! (regex match)');
    } else {
        console.log('Failed both match strategies.');
    }
}
