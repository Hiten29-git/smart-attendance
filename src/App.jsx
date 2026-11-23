import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  Activity,
  AlertCircle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Download,
  Fingerprint,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { auth, db } from "../firebase";
import "./App.css";

const today = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const cleanUid = (value) => value.trim().replace(/\s+/g, "").toUpperCase();

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [activePage, setActivePage] = useState("Overview");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(today());
  const [cardUid, setCardUid] = useState("");
  const [session, setSession] = useState("Regular Class");

  const [showStudentForm, setShowStudentForm] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [studentDepartment, setStudentDepartment] = useState("");
  const [studentYear, setStudentYear] = useState("");
  const [studentCard, setStudentCard] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setStudents([]);
      setAttendance([]);
      return;
    }

    setLoadingData(true);
    setError("");

    const stopStudents = onSnapshot(
      collection(db, "students"),
      (snapshot) => {
        const list = snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            name: data.name || data.Name || "Unnamed student",
            cardUid: data.cardUid || data.carduid || item.id,
            active: data.active ?? data.Active ?? true,
            studentNumber: data.studentNumber || "",
            department: data.department || "",
            year: data.year || "",
          };
        });
        setStudents(list);
        setLoadingData(false);
      },
      (err) => {
        setError(`Could not load students: ${err.message}`);
        setLoadingData(false);
      }
    );

    const stopAttendance = onSnapshot(
      collection(db, "attendance"),
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setAttendance(list);
      },
      (err) => setError(`Could not load attendance: ${err.message}`)
    );

    return () => {
      stopStudents();
      stopAttendance();
    };
  }, [user]);

  const todayAttendance = useMemo(
    () => attendance.filter((record) => record.date === selectedDate),
    [attendance, selectedDate]
  );

  const presentStudentIds = new Set(
    todayAttendance.map((record) => record.studentId)
  );

  const filteredStudents = students.filter((student) => {
    const term = search.toLowerCase();
    return (
      student.name.toLowerCase().includes(term) ||
      student.cardUid.toLowerCase().includes(term) ||
      student.studentNumber.toLowerCase().includes(term)
    );
  });

  const filteredAttendance = todayAttendance.filter((record) => {
    const term = search.toLowerCase();
    return (
      (record.name || "").toLowerCase().includes(term) ||
      (record.cardUid || "").toLowerCase().includes(term)
    );
  });

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setLoginError(err.message);
    }
  }

  async function handleAddStudent(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    const uid = cleanUid(studentCard);
    if (!studentName.trim() || !uid) {
      setError("Enter the student's name and NFC card UID.");
      return;
    }

    try {
      await setDoc(doc(db, "students", uid), {
        name: studentName.trim(),
        cardUid: uid,
        studentNumber: studentNumber.trim(),
        department: studentDepartment.trim(),
        year: studentYear.trim(),
        active: true,
        createdAt: serverTimestamp(),
      });

      setStudentName("");
      setStudentNumber("");
      setStudentDepartment("");
      setStudentYear("");
      setStudentCard("");
      setShowStudentForm(false);
      setNotice("Student registered successfully.");
    } catch (err) {
      setError(`Student registration failed: ${err.message}`);
    }
  }

  async function markAttendance(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    const uid = cleanUid(cardUid);
    if (!uid) {
      setError("Enter or scan an NFC card UID first.");
      return;
    }

    const student = students.find(
      (item) => cleanUid(item.cardUid) === uid && item.active
    );

    if (!student) {
      setError("Card not registered or student is inactive.");
      return;
    }

    const sessionKey = session.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const recordId = `${selectedDate}_${sessionKey}_${uid}`;
    const recordRef = doc(db, "attendance", recordId);

    try {
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(recordRef);
        if (existing.exists()) {
          throw new Error("Attendance already marked for this student and session.");
        }

        transaction.set(recordRef, {
          studentId: student.id,
          name: student.name,
          cardUid: uid,
          session,
          date: selectedDate,
          timestamp: serverTimestamp(),
          markedBy: user.uid,
        });
      });

      setNotice(`Attendance marked for ${student.name}.`);
      setCardUid("");
    } catch (err) {
      setError(err.message || "Could not mark attendance.");
    }
  }

  function exportCsv() {
    const rows = [
      ["Student Name", "Student ID", "Card UID", "Session", "Date", "Time"],
      ...filteredAttendance.map((record) => [
        record.name || "",
        record.studentId || "",
        record.cardUid || "",
        record.session || "",
        record.date || "",
        record.timestamp?.toDate
          ? record.timestamp.toDate().toLocaleTimeString()
          : "",
      ]),
    ];

    const csv = rows
      .map((row) =>
        row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${selectedDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading) {
    return <div className="loading-screen">Loading Smart Attendance…</div>;
  }

  if (!user) {
    return (
      <main className="login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="brand-mark"><Fingerprint size={28} /></div>
          <p className="eyebrow">SMART CAMPUS SYSTEM</p>
          <h1>Welcome back</h1>
          <p className="muted">Sign in to manage college attendance.</p>

          <label>Email address</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@college.edu"
            required
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
          />
          {loginError && <p className="error-message">{loginError}</p>}
          <button className="primary-button full-button" type="submit">
            Sign in
          </button>
          <p className="login-footnote">
            Use the account you created in Firebase Authentication.
          </p>
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Fingerprint size={25} /></div>
          <div>
            <strong>Attendly</strong>
            <span>SMART CAMPUS</span>
          </div>
        </div>

        <p className="nav-heading">WORKSPACE</p>
        {[
          { name: "Overview", icon: LayoutDashboard },
          { name: "Students", icon: Users },
          { name: "Attendance", icon: CalendarDays },
        ].map(({ name, icon: Icon }) => (
          <button
            key={name}
            className={`nav-link ${activePage === name ? "selected" : ""}`}
            onClick={() => {
              setActivePage(name);
              setSearch("");
            }}
          >
            <Icon size={18} /> {name}
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="admin-chip">
            <div className="avatar">{(user.email || "A")[0].toUpperCase()}</div>
            <div className="admin-details">
              <strong>Administrator</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <button className="nav-link logout-link" onClick={() => signOut(auth)}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">COLLEGE MANAGEMENT</p>
            <h1>{activePage}</h1>
          </div>
          <div className="topbar-right">
            <span className="live-indicator"><span /> Firebase connected</span>
            <div className="avatar">{(user.email || "A")[0].toUpperCase()}</div>
          </div>
        </header>

        <section className="page-content">
          {error && (
            <div className="alert alert-error">
              <AlertCircle size={18} /> {error}
              <button onClick={() => setError("")}><X size={16} /></button>
            </div>
          )}
          {notice && (
            <div className="alert alert-success">
              <CheckCircle2 size={18} /> {notice}
              <button onClick={() => setNotice("")}><X size={16} /></button>
            </div>
          )}

          {activePage === "Overview" && (
            <>
              <div className="welcome-panel">
                <div>
                  <p className="eyebrow">ATTENDANCE AT A GLANCE</p>
                  <h2>Good day, Administrator.</h2>
                  <p>Monitor students and NFC attendance from one place.</p>
                </div>
                <div className="welcome-icon"><GraduationCap size={46} /></div>
              </div>

              <div className="stats-grid">
                <StatCard icon={Users} label="Total students" value={students.length} />
                <StatCard icon={CheckCircle2} label="Present on selected date" value={todayAttendance.length} />
                <StatCard icon={Activity} label="Attendance rate" value={`${students.length ? Math.round((new Set(todayAttendance.map((r) => r.studentId)).size / students.length) * 100) : 0}%`} />
                <StatCard icon={ShieldCheck} label="Active cards" value={students.filter((s) => s.active).length} />
              </div>

              <div className="section-heading">
                <div>
                  <p className="eyebrow">NFC READER</p>
                  <h2>Mark attendance</h2>
                </div>
              </div>
              <AttendanceScanner
                cardUid={cardUid}
                setCardUid={setCardUid}
                session={session}
                setSession={setSession}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                onSubmit={markAttendance}
              />

              <div className="section-heading table-heading">
                <div>
                  <p className="eyebrow">LATEST ACTIVITY</p>
                  <h2>Attendance records</h2>
                </div>
                <button className="secondary-button" onClick={() => setActivePage("Attendance")}>
                  View all
                </button>
              </div>
              <AttendanceTable records={todayAttendance.slice(0, 5)} />
            </>
          )}

          {activePage === "Students" && (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">STUDENT DIRECTORY</p>
                  <h2>Registered students</h2>
                  <p className="muted">Manage student profiles and their NFC cards.</p>
                </div>
                <button className="primary-button" onClick={() => setShowStudentForm(true)}>
                  <Plus size={18} /> Add student
                </button>
              </div>
              <SearchBox value={search} onChange={setSearch} placeholder="Search name, student ID or card UID…" />
              <div className="table-card">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Student</th><th>Student ID</th><th>Department</th><th>NFC card UID</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student) => (
                        <tr key={student.id}>
                          <td><strong>{student.name}</strong></td>
                          <td>{student.studentNumber || "—"}</td>
                          <td>{student.department || "—"}</td>
                          <td><code>{student.cardUid}</code></td>
                          <td><span className={`status ${student.active ? "status-active" : "status-inactive"}`}>{student.active ? "Active" : "Inactive"}</span></td>
                        </tr>
                      ))}
                      {!filteredStudents.length && <EmptyRow text="No students found." />}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activePage === "Attendance" && (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">DAILY REGISTER</p>
                  <h2>Attendance history</h2>
                  <p className="muted">Review attendance by date and export the register.</p>
                </div>
                <button className="primary-button" onClick={exportCsv}>
                  <Download size={18} /> Export CSV
                </button>
              </div>
              <div className="filter-row">
                <label className="date-filter">
                  <CalendarDays size={18} />
                  <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
                </label>
                <SearchBox value={search} onChange={setSearch} placeholder="Search attendance…" />
              </div>
              <AttendanceTable records={filteredAttendance} />
            </>
          )}

          {loadingData && <p className="muted loading-note">Loading Firestore records…</p>}
        </section>
      </main>

      {showStudentForm && (
        <div className="modal-backdrop" onClick={() => setShowStudentForm(false)}>
          <form className="modal-card" onSubmit={handleAddStudent} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div><p className="eyebrow">NEW RECORD</p><h2>Register student</h2></div>
              <button type="button" className="icon-button" onClick={() => setShowStudentForm(false)}><X /></button>
            </div>
            <label>Student full name *</label>
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="e.g. Hiten G" required />
            <label>Student ID / USN</label>
            <input value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} placeholder="e.g. 1PU..." />
            <label>Department</label>
            <input value={studentDepartment} onChange={(e) => setStudentDepartment(e.target.value)} placeholder="e.g. Computer Science" />
            <label>Year / Semester</label>
            <input value={studentYear} onChange={(e) => setStudentYear(e.target.value)} placeholder="e.g. 2nd Year" />
            <label>NFC card UID *</label>
            <input value={studentCard} onChange={(e) => setStudentCard(e.target.value)} placeholder="Scan or enter card UID" required />
            <p className="form-hint">Use the UID read by your PN532 reader. Each card UID must be unique.</p>
            <button className="primary-button full-button" type="submit">Save student</button>
          </form>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-icon"><Icon size={20} /></div>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="search-box">
      <Search size={18} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function AttendanceScanner({
  cardUid,
  setCardUid,
  session,
  setSession,
  selectedDate,
  setSelectedDate,
  onSubmit,
}) {
  return (
    <form className="scanner-card" onSubmit={onSubmit}>
      <div className="scanner-symbol"><Fingerprint size={34} /></div>
      <div className="scanner-fields">
        <div className="scanner-title">
          <div><h3>Scan student card</h3><p>Enter the NFC UID from your PN532 reader.</p></div>
          <span className="scanner-status"><span /> READY</span>
        </div>
        <div className="scanner-inputs">
          <input value={cardUid} onChange={(e) => setCardUid(e.target.value)} placeholder="Enter NFC card UID…" />
          <select value={session} onChange={(e) => setSession(e.target.value)}>
            <option>Regular Class</option>
            <option>Morning Session</option>
            <option>Afternoon Session</option>
            <option>Lab Session</option>
          </select>
          <input aria-label="Attendance date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          <button className="primary-button" type="submit"><CheckCircle2 size={18} /> Mark present</button>
        </div>
      </div>
    </form>
  );
}

function AttendanceTable({ records }) {
  return (
    <div className="table-card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Student</th><th>Card UID</th><th>Session</th><th>Date</th><th>Time</th><th>Status</th></tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td><strong>{record.name || "Unknown student"}</strong></td>
                <td><code>{record.cardUid || "—"}</code></td>
                <td>{record.session || "—"}</td>
                <td>{record.date || "—"}</td>
                <td>{record.timestamp?.toDate ? record.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td><span className="status status-active">Present</span></td>
              </tr>
            ))}
            {!records.length && <EmptyRow text="No attendance records for this date." />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyRow({ text }) {
  return <tr><td className="empty-cell" colSpan="6">{text}</td></tr>;
}

export default App;