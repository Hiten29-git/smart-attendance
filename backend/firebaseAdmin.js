
const { initializeApp, applicationDefault } =
  require("firebase-admin/app");

const { getFirestore } =
  require("firebase-admin/firestore");

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "attendance-system-7e859",
});

const db = getFirestore(app);

module.exports = { db };
