Meteor.startup(() => {
  try {
    if (require("zod")) {
      import "./src/extendWithSchema";
    }
  } catch (e) {
    console.error("zod package not found. Without it, you can't use zod-schema package.");
    console.error("Please install zod using meteor npm install zod\n\n");
  
    console.error(e);
  }  
});