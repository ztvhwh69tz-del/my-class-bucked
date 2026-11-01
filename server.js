const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// --- MONGODB GA ULANISH ---
// MONGO_URI o'rniga o'zhavolangizni yozing yoki Render environment variable'ga qo'shing
const MONGO_URI = process.env.MONGO_URI || "SIZNING_MONGODB_CONNECTION_STRING_MANZILINGIZ";

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB ga muvaffaqiyatli ulandi!"))
    .catch(err => console.error("MongoDB ulanishda xatolik:", err));

// --- SCHEMALAR VA MODELLAR ---
const teacherSchema = new mongoose.Schema({
    login: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    time: { type: Date, default: Date.now }
});
const Teacher = mongoose.model('Teacher', teacherSchema);

const attendanceSchema = new mongoose.Schema({
    unique_id: { type: String, required: true, unique: true },
    teacher_name: String,
    group_name: String,
    student_name: String,
    time: Date
}, { strict: false });
const Attendance = mongoose.model('Attendance', attendanceSchema);

const naryadSchema = new mongoose.Schema({
    unique_id: { type: String, required: true, unique: true },
    time: Date
}, { strict: false });
const Naryad = mongoose.model('Naryad', naryadSchema);

const groupSchema = new mongoose.Schema({
    teacher: { type: String, required: true, unique: true, lowercase: true, trim: true },
    groups: { type: mongoose.Schema.Types.Mixed, default: [] }
});
const GroupData = mongoose.model('GroupData', groupSchema);


// --- GURUH VA O'QUVCHILARNI SAQLASH API ---
app.get('/api/groups/:teacher', async (req, res) => {
    try {
        const teacher = req.params.teacher.trim().toLowerCase();
        const record = await GroupData.findOne({ teacher });
        res.json(record ? record.groups : []);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/groups/:teacher', async (req, res) => {
    try {
        const teacher = req.params.teacher.trim().toLowerCase();
        const groups = req.body.groups;
        
        await GroupData.findOneAndUpdate(
            { teacher },
            { groups },
            { upsert: true, new: true }
        );
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- DAVOMAT API ---
app.post('/api/attendance', async (req, res) => {
    try {
        const data = req.body; 
        const teacher = (data.teacher_name || '').trim();
        const group = (data.group_name || '').trim();
        const student = (data.student_name || '').trim();
        
        const recordDate = new Date(data.time).toISOString().split('T')[0];
        data.unique_id = `${teacher}_${group}_${student}_${recordDate}`;

        const updated = await Attendance.findOneAndUpdate(
            { unique_id: data.unique_id },
            data,
            { upsert: true, new: true }
        );

        io.emit('live_attendance', updated);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/attendance', async (req, res) => {
    try {
        const records = await Attendance.find();
        res.json(records);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/attendance/:unique_id', async (req, res) => {
    try {
        const { unique_id } = req.params;
        const deleted = await Attendance.findOneAndDelete({ unique_id });
        if (!deleted) return res.status(404).json({ success: false, message: "Topilmadi" });
        
        io.emit('attendance_deleted', unique_id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- NARYADCHILAR API ---
app.post('/api/naryad', async (req, res) => {
    try {
        const data = req.body;
        const unique_id = `naryad_${Date.now()}_${Math.random()}`;
        const naryadRecord = new Naryad({ unique_id, ...data });
        await naryadRecord.save();

        io.emit('live_naryad', naryadRecord);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/naryad', async (req, res) => {
    try {
        const records = await Naryad.find().sort({ _id: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/naryad/:unique_id', async (req, res) => {
    try {
        const { unique_id } = req.params;
        const deleted = await Naryad.findOneAndDelete({ unique_id });
        if (!deleted) return res.status(404).json({ success: false, message: "Topilmadi" });
        
        io.emit('naryad_deleted', unique_id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- O'QITUVCHILAR API ---
app.post('/api/teachers/register', async (req, res) => {
    try {
        const { login, password, time } = req.body;
        if (!login) return res.status(400).json({ success: false, message: "Login kiritilmadi" });

        const cleanLogin = login.trim().toLowerCase();
        let existing = await Teacher.findOne({ login: cleanLogin });

        if (!existing) {
            const newTeacher = new Teacher({
                login: login.trim(),
                password: password ? password.trim() : '',
                time: time || new Date()
            });
            await newTeacher.save();
            io.emit('teacher_added', newTeacher);
        } else {
            if (password) {
                existing.password = password.trim();
                await existing.save();
            }
        }
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/teachers', async (req, res) => {
    try {
        const { login, password } = req.body;
        if (!login || !password) return res.status(400).json({ success: false, message: "Login va parol kiritilishi shart" });

        const cleanLogin = login.trim().toLowerCase();
        const exists = await Teacher.findOne({ login: cleanLogin });
        if (exists) {
            return res.status(400).json({ success: false, message: "Bu login band!" });
        }

        const newTeacher = new Teacher({
            login: login.trim(),
            password: password.trim(),
            time: new Date()
        });
        await newTeacher.save();
        io.emit('teacher_added', newTeacher);
        res.status(201).json({ success: true, teacher: newTeacher });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/teachers', async (req, res) => {
    try {
        const teachers = await Teacher.find();
        res.json(teachers);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/teachers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let deleted = null;
        
        // MongoDB _id bo'yicha yoki login bo'yicha o'chirish
        if (id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
            deleted = await Teacher.findByIdAndDelete(id);
        }
        if (!deleted) {
            deleted = await Teacher.findOneAndDelete({ login: id });
        }
        
        if (!deleted) return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
        
        io.emit('teacher_deleted', id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ishga tushdi: http://localhost:${PORT}`);
});
