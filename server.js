const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Статик papkani ulash
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let attendanceRecords = [];
let naryadRecords = []; 
let students = []; 
let teachers = []; // O'qituvchilar (Login va parollar bilan)

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
    res.status(200).json({ success: true });
});

app.get('/api/attendance', (req, res) => {
    cleanOldRecords();
    res.json(attendanceRecords);
});

// Davomat yozuvini o'chirish
app.delete('/api/attendance/:unique_id', (req, res) => {
    const { unique_id } = req.params;
    const index = attendanceRecords.findIndex(r => r.unique_id === unique_id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "Ma'lumot topilmadi" });
    }
    attendanceRecords.splice(index, 1);
    io.emit('attendance_deleted', unique_id);
    res.json({ success: true });
});

// --- NARYADCHILAR API ---
app.post('/api/naryad', (req, res) => {
    const data = req.body;
    const naryadRecord = {
        unique_id: `naryad_${Date.now()}_${Math.random()}`,
        ...data
    };
    
    naryadRecords.unshift(naryadRecord);
    cleanOldRecords();
    io.emit('live_naryad', naryadRecord);
    res.status(200).json({ success: true });
});

app.get('/api/naryad', (req, res) => {
    cleanOldRecords();
    res.json(naryadRecords);
});

// Naryad yozuvini o'chirish
app.delete('/api/naryad/:unique_id', (req, res) => {
    const { unique_id } = req.params;
    const index = naryadRecords.findIndex(r => r.unique_id === unique_id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "Ma'lumot topilmadi" });
    }
    naryadRecords.splice(index, 1);
    io.emit('naryad_deleted', unique_id);
    res.json({ success: true });
});

// --- O'QITUVCHILAR API ---
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

    res.status(200).json({ success: true });
});

app.get('/api/teachers', (req, res) => {
    res.json(teachers);
});

// O'qituvchini o'chirish
app.delete('/api/teachers/:id', (req, res) => {
    const { id } = req.params;
    const index = teachers.findIndex(t => t.id === id || t.login === id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }
    const deleted = teachers.splice(index, 1)[0];
    io.emit('teacher_deleted', id);
    res.json({ success: true, deleted });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ishga tushdi: http://localhost:${PORT}`);
});
