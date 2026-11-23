
const express = require("express");
const cors = require("cors");
const { db } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3000;

app.get("/", (req, res) => {
  res.json({ status: "Attendance backend running" });
});

app.post("/api/attendance", async (req, res) => {
  try {
    const uid = String(req.body.uid || "")
      .replace(/[^a-fA-F0-9]/g, "")
      .toUpperCase();

    const session = req.body.session || "Morning";

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "Card UID is required"
      });
    }

    const students = await db.collection("students").get();

    const studentDoc = students.docs.find(doc => {
      const data = doc.data();
      const cardUid = String(data.cardUid || data.carduid || doc.id)
        .replace(/[^a-fA-F0-9]/g, "")
        .toUpperCase();

      return cardUid === uid &&
        (data.active ?? data.Active ?? true) === true;
    });

    if (!studentDoc) {
      return res.status(404).json({
        success: false,
        message: "Student not registered"
      });
    }

    const student = studentDoc.data();
    const name = student.name || student.Name || "Student";

    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata"
    }).format(new Date());

    const sessionKey = session.toLowerCase();
    const recordId = `${date}_${sessionKey}_${uid}`;
    const attendanceRef = db.collection("attendance").doc(recordId);

    await db.runTransaction(async transaction => {
      const existing = await transaction.get(attendanceRef);

      if (existing.exists) {
        throw new Error("DUPLICATE");
      }

      transaction.set(attendanceRef, {
        studentId: studentDoc.id,
        name,
        cardUid: uid,
        session,
        date,
        timestamp: FieldValue.serverTimestamp(),
        markedBy: "ESP32",
        source: "RFID"
      });
    });

    res.json({
      success: true,
      message: "Attendance marked",
      student: name,
      uid,
      date,
      session
    });

  } catch (error) {
    if (error.message === "DUPLICATE") {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked"
      });
    }

    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Attendance backend running on port ${PORT}`);
});
