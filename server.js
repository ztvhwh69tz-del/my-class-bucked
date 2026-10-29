const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Ma'lumotlarni faylda saqlash uchun fayl yo'li
const DB_FILE = path.join(__dirname, 'database.json');

// Bazani o'qish funksiyasi
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("Bazani o'qishda xatolik:", e);
    }
    return { attendanceRecords: [], naryadRecords: [], teachers: [], students: [] };
}

// Bazaga yozish funksiyasi
function saveDatabase(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error("Bazani yozishda xatolik:", e);
    }
}

// 7 kundan eski ma'lumotlarni tozalash va saqlash
function cleanAndSave(db) {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    db.attendanceRecords = db.attendanceRecords.filter(item => new Date(item.time).getTime() >= oneWeekAgo);
    db.naryadRecords = db.naryadRecords.filter(item => new Date(item.time).getTime() >= oneWeekAgo);
    saveDatabase(db);
}

// --- DAVOMAT API ---
app.post('/api/attendance', (req, res) => {
    const db = loadDatabase();
    const data = req.body; 
    const teacher = (data.teacher_name || '').trim();
    const group = (data.group_name || '').trim();
    const student = (data.student_name || '').trim();
    
    const recordDate = new Date(data.time).toISOString().split('T')[0];
    data.unique_id = `${teacher}_${group}_${student}_${recordDate}`;

    const existingIndex = db.attendanceRecords.findIndex(r => r.unique_id === data.unique_id);
    if (existingIndex !== -1) {
        db.attendanceRecords[existingIndex] = data; 
    } else {
        db.attendanceRecords.push(data); 
    }

    cleanAndSave(db);
    io.emit('live_attendance', data);
    res.status(200).json({ success: true });
});

app.get('/api/attendance', (req, res) => {
    const db = loadDatabase();
    res.json(db.attendanceRecords);
});

app.delete('/api/attendance/:unique_id', (req, res) => {
    const db = loadDatabase();
    const { unique_id } = req.params;
    const index = db.attendanceRecords.findIndex(r => r.unique_id === unique_id);
    if (index === -1) return res.status(404).json({ success: false, message: "Topilmadi" });
    db.attendanceRecords.splice(index, 1);
    saveDatabase(db);
    io.emit('attendance_deleted', unique_id);
    res.json({ success: true });
});

// --- NARYADCHILAR API ---
app.post('/api/naryad', (req, res) => {
    const db = loadDatabase();
    const data = req.body;
    const naryadRecord = { unique_id: `naryad_${Date.now()}_${Math.random()}`, ...data };
    db.naryadRecords.unshift(naryadRecord);
    cleanAndSave(db);
    io.emit('live_naryad', naryadRecord);
    res.status(200).json({ success: true });
});

app.get('/api/naryad', (req, res) => {
    const db = loadDatabase();
    res.json(db.naryadRecords);
});

app.delete('/api/naryad/:unique_id', (req, res) => {
    const db = loadDatabase();
    const { unique_id } = req.params;
    const index = db.naryadRecords.findIndex(r => r.unique_id === unique_id);
    if (index === -1) return res.status(404).json({ success: false, message: "Topilmadi" });
    db.naryadRecords.splice(index, 1);
    saveDatabase(db);
    io.emit('naryad_deleted', unique_id);
    res.json({ success: true });
});

// --- O'QITUVCHILAR API ---
app.post('/api/teachers/register', (req, res) => {
    const db = loadDatabase();
    const { login, password, time } = req.body;
    if (!login) return res.status(400).json({ success: false, message: "Login kiritilmadi" });

    let existing = db.teachers.find(t => t.login === login.trim());
    if (!existing) {
        const newTeacher = {
            id: Date.now().toString(),
            login: login.trim(),
            password: password ? password.trim() : '',
            time: time || new Date().toISOString()
        };
        db.teachers.push(newTeacher);
        saveDatabase(db);
        io.emit('teacher_added', newTeacher);
    } else {
        if (password) {
            existing.password = password.trim();
            saveDatabase(db);
        }
    }
    res.status(200).json({ success: true });
});

app.post('/api/teachers', (req, res) => {
    const db = loadDatabase();
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ success: false, message: "Login va parol kiritilishi shart" });

    if (db.teachers.some(t => t.login === login.trim())) {
        return res.status(400).json({ success: false, message: "Bu login band!" });
    }

    const newTeacher = {
        id: Date.now().toString(),
        login: login.trim(),
        password: password.trim(),
        time: new Date().toISOString()
    };
    db.teachers.push(newTeacher);
    saveDatabase(db);
    io.emit('teacher_added', newTeacher);
    res.status(201).json({ success: true, teacher: newTeacher });
});

app.get('/api/teachers', (req, res) => {
    const db = loadDatabase();
    res.json(db.teachers);
});

app.delete('/api/teachers/:id', (req, res) => {
    const db = loadDatabase();
    const { id } = req.params;
    const index = db.teachers.findIndex(t => t.id === id || t.login === id);
    if (index === -1) return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    db.teachers.splice(index, 1);
    saveDatabase(db);
    io.emit('teacher_deleted', id);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ishga tushdi: http://localhost:${PORT}`);
});
