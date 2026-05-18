const fs = require('fs');
let code = fs.readFileSync('components/MessagingModule.tsx', 'utf8');

const regex = /\)\}[\r\n\s]*<\/div>[\r\n\s]*\)\}[\r\n\s]*<\/div>[\r\n\s]*<\/div>[\r\n\s]*\)\}[\r\n\s]*<\/div>/;

if (regex.test(code)) {
    code = code.replace(regex, ')}\n                        </div>\n                    </div>\n                )}\n            </div>');
    fs.writeFileSync('components/MessagingModule.tsx', code);
    console.log('Fixed syntax error!');
} else {
    console.log('Could not find bad syntax.');
}
