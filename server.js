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
let students = []; // O'quvchilar ro'yxati
let teachers = []; // O'qituvchilar ro'yxati

// 7 kundan eski ma'lumotlarni tozalash
function cleanOldRecords() {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    attendanceRecords = attendanceRecords.filter(item => {
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
    res.status(200).json({ success: true });
});

app.get('/api/attendance', (req, res) => {
    cleanOldRecords();
    res.json(attendanceRecords);
});

// --- O'QUVCHILAR API (Qo'shish va O'chirish) ---
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
    io.emit('student_added', newStudent); // Barcha ulangan oynalarga xabar berish
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

// --- O'QITUVCHILAR API (Qo'shish va O'chirish) ---
app.get('/api/teachers', (req, res) => {
    res.json(teachers);
});

app.post('/api/teachers', (req, res) => {
    const { name, subject } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, message: "O'qituvchi ismi kiritilmadi" });
    }
    const newTeacher = {
        id: Date.now().toString(),
        name: name.trim(),
        subject: (subject || '').trim()
    };
    teachers.push(newTeacher);
    io.emit('teacher_added', newTeacher);
    res.status(201).json({ success: true, teacher: newTeacher });
});

app.delete('/api/teachers/:id', (req, res) => {
    const { id } = req.params;
    const index = teachers.findIndex(t => t.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }
    const deleted = teachers.splice(index, 1)[0];
    io.emit('teacher_deleted', id);
    res.json({ success: true, deleted });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ishga tushdi: http://localhost:${PORT}`);
});
