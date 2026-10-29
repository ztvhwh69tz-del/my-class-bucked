const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Статик papkani ulash (frontend fayllar shu yerda bo'lishi kerak)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let attendanceRecords = [];
let naryadRecords = []; // Naryadga tushgan o'quvchilar ro'yxati
let students = []; // O'quvchilar ro'yxati
let teachers = []; // O'qituvchilar ro'yxati (Login va parollar bilan)

// 7 kundan eski ma'lumotlarni tozalash
function cleanOldRecords() {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    attendanceRecords = attendanceRecords.filter(item => {
        const itemTime = new Date(item.time).getTime();
        return itemTime >= oneWeekAgo;
    });
    naryadRecords = naryadRecords.filter(item => {
        const itemTime = new Date(item.time).getTime();
        return itemTime >= oneWeekAgo;
    });
}

// --- DAVOMAT API ---
app.post('/api/attendance', (req, res) => {
    const data = req.body; 
    
    const teacher = (data.teacher_name || '').trim();
    const group = (data.group_name || '').trim();
    const student = (data.student_name || '').trim();
    
    const recordDate = new Date(data.time).toISOString().split('T')[0];
    data.unique_id = `${teacher}_${group}_${student}_${recordDate}`;

    const existingIndex = attendanceRecords.findIndex(r => r.unique_id === data.unique_id);
    if (existingIndex !== -1) {
        attendanceRecords[existingIndex] = data; 
    } else {
        attendanceRecords.push(data); 
    }

    cleanOldRecords();
    io.emit('live_attendance', data);

    console.log("--> Davomat yangilandi:", data);
    res.status(250).json({ success: true });
});

app.get('/api/attendance', (req, res) => {
    cleanOldRecords();
    res.json(attendanceRecords);
});

// --- NARYADCHILAR API (Yangi qo'shildi) ---
app.post('/api/naryad', (req, res) => {
    const data = req.body;
    const naryadRecord = {
        unique_id: Date.now().toString(),
        ...data
    };
    
    naryadRecords.unshift(naryadRecord);
    cleanOldRecords();
    
    // Direktor paneliga jonli uzatish uchun
    io.emit('live_naryad', naryadRecord);

    console.log("--> Naryadga qo'shildi:", naryadRecord);
    res.status(200).json({ success: true });
});

app.get('/api/naryad', (req, res) => {
    cleanOldRecords();
    res.json(naryadRecords);
});

// --- O'QITUVCHILAR LOGIN / REGISTRATION API (Yangi qo'shildi) ---
app.post('/api/teachers/register', (req, res) => {
    const { login, password, time } = req.body;
    if (!login) {
        return res.status(400).json({ success: false, message: "Login kiritilmadi" });
    }

    const existing = teachers.find(t => t.login === login.trim());
    if (!existing) {
        const newTeacher = {
            id: Date.now().toString(),
            login: login.trim(),
            password: password ? password.trim() : '',
            time: time || new Date().toISOString()
        };
        teachers.push(newTeacher);
        io.emit('teacher_added', newTeacher);
    } else {
        existing.password = password ? password.trim() : existing.password;
    }

    console.log("--> O'qituvchi kirdi/saqlandi:", login);
    res.status(200).json({ success: true });
});

app.get('/api/teachers', (req, res) => {
    res.json(teachers);
});

// --- O'QUVCHILAR API ---
app.get('/api/students', (req, res) => {
    res.json(students);
});

app.post('/api/students', (req, res) => {
    const { name, group_name } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, message: "O'quvchi ismi kiritilmadi" });
    }
    const newStudent = {
        id: Date.now().toString(),
        name: name.trim(),
        group_name: (group_name || '').trim()
    };
    students.push(newStudent);
    io.emit('student_added', newStudent); 
    res.status(201).json({ success: true, student: newStudent });
});

app.delete('/api/students/:id', (req, res) => {
    const { id } = req.params;
    const index = students.findIndex(s => s.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "O'quvchi topilmadi" });
    }
    const deleted = students.splice(index, 1)[0];
    io.emit('student_deleted', id);
    res.json({ success: true, deleted });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ishga tushdi: http://localhost:${PORT}`);
});
