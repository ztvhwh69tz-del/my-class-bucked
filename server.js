const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let attendanceRecords = [];

// 7 kundan eski ma'lumotlarni tozalash
function cleanOldRecords() {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    attendanceRecords = attendanceRecords.filter(item => {
        const itemTime = new Date(item.time).getTime();
        return itemTime >= oneWeekAgo;
    });
}

app.post('/api/attendance', (req, res) => {
    const data = req.body; 
    
    // Matnlardagi ortiqcha bo'shliqlarni tozalash
    const teacher = (data.teacher_name || '').trim();
    const group = (data.group_name || '').trim();
    const student = (data.student_name || '').trim();
    
    const recordDate = new Date(data.time).toISOString().split('T')[0];
    
    // Har bir o'quvchi uchun kunlik unikal ID
    data.unique_id = `${teacher}_${group}_${student}_${recordDate}`;

    // Agar shu o'quvchi buгун ro'yxatda bo'lsa, ustiga yozamiz (yangilaymiz)
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

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ishga tushdi: http://localhost:${PORT}`);
});
