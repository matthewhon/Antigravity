const fs = require('fs');
const file = 'dist/index.html';

if (fs.existsSync(file)) {
  let html = fs.readFileSync(file, 'utf8');
  
  // Replace the module script tag with a dynamic import that catches and prints errors
  // This regex matches regardless of crossorigin or other attributes
  html = html.replace(
    /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
    `<script type="module">
      console.log("Postbuild dynamic import handler: attempting to load $1");
      import("$1").then(function() {
        console.log("Postbuild dynamic import handler: successfully loaded $1");
      }).catch(function(err) {
        console.error("Dynamic import caught error loading $1:", err);
        if (err) {
          console.error("Error Message:", err.message);
          console.error("Error Stack:", err.stack);
        }
      });
    </script>`
  );
  
  fs.writeFileSync(file, html);
  console.log("Postbuild: successfully wrapped script in dynamic import error handler.");
} else {
  console.error("Postbuild: dist/index.html not found!");
}
