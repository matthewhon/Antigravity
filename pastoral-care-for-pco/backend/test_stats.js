const id = process.argv[2];
const cid = process.argv[3];
fetch(`http://localhost:8080/email/stats`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ campaignId: cid, churchId: id })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
