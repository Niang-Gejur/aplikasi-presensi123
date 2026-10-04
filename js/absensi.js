/**
 * Portal Karyawan - Absensi
 * Attendance/Clock In-Out functionality
 * (Fitur istirahat, selesai istirahat, dan lembur sudah dihapus)
 */

const absensi = {
    currentState: 'waiting', // waiting, clocked-in, completed, libur
    attendanceData: {},
    liveClockInterval: null,

    async init() {
        await this.loadTodayAttendance();
        await this.loadAttendanceHistory();
        this.initLiveClock();
        this.initButtons();
        this.renderTimeline();
        this.updateUI();
    },

    async loadTodayAttendance() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';

        try {
            const [result, settingsRes] = await Promise.all([
                api.getTodayAttendance(userId),
                api.getSettings()
            ]);

            // Sync global schedule shift mapping from Admin to this employee's local instance
            if (settingsRes && settingsRes.success && settingsRes.data) {
                const globalSettings = settingsRes.data;
                const loadedSchedules = {};
                Object.keys(globalSettings).forEach(k => {
                    if (k.startsWith('shift_schedule_')) {
                        const monthKey = k.replace('shift_schedule_', '');
                        try {
                            loadedSchedules[monthKey] = JSON.parse(globalSettings[k]);
                        } catch (e) { }
                    }
                });
                if (Object.keys(loadedSchedules).length > 0) {
                    storage.set('shift_schedule', loadedSchedules);
                }
            }

            let todayAttendance = result?.data || {};

            if (!todayAttendance.date) {
                const today = dateTime.getLocalDate();
                let currentShift = currentUser?.shift || 'Pagi';

                // Automated shift lookup from admin schedule
                try {
                    const stringUserId = String(userId);
                    const schedules = storage.get('shift_schedule', {});
                    const todayObj = new Date();
                    const key = `${todayObj.getFullYear()}-${todayObj.getMonth()}`;
                    const currentDay = todayObj.getDate();

                    if (schedules[key] && schedules[key][stringUserId]) {
                        const assignedShift = schedules[key][stringUserId][currentDay];
                        if (assignedShift) {
                            currentShift = assignedShift;
                        }
                    }
                } catch (e) {
                    console.error('Error reading shift schedule:', e);
                }

                todayAttendance = {
                    date: today,
                    shift: currentShift,
                    clockIn: null,
                    clockOut: null,
                    status: 'waiting'
                };
            }

            // Ensure null values are explicitly set (not undefined)
            todayAttendance.clockIn = todayAttendance.clockIn || null;
            todayAttendance.clockOut = todayAttendance.clockOut || null;

            this.attendanceData = todayAttendance;

            // Determine current state
            if (todayAttendance.shift === 'Libur' && !todayAttendance.clockIn) {
                this.currentState = 'libur';
            } else if (todayAttendance.clockOut) {
                this.currentState = 'completed';
            } else if (todayAttendance.clockIn) {
                this.currentState = 'clocked-in';
            } else {
                this.currentState = 'waiting';
            }
        } catch (error) {
            console.error('Error loading attendance:', error);
        }
    },

    async loadAttendanceHistory() {
        try {
            const result = await api.getAllAttendance();
            const allData = result.data || [];

            // Filter by current user
            const currentUser = auth.getCurrentUser();
            const userId = currentUser?.id || 'demo-user';
            const historyData = allData.filter(d => String(d.userId) === String(userId));

            this.renderHistory(historyData);
        } catch (error) {
            console.error('Error loading history:', error);
        }
    },

    renderHistory(historyData) {
        const tbody = document.getElementById('attendance-history');
        if (!tbody) return;

        if (historyData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Belum ada riwayat absensi.</td></tr>';
            return;
        }

        tbody.innerHTML = historyData.slice(0, 10).map(record => {
            // Calculate duration if clocked out
            let duration = '--';
            if (record.clockIn && record.clockOut) {
                const [inH, inM] = record.clockIn.split(':').map(Number);
                const [outH, outM] = record.clockOut.split(':').map(Number);
                const diffInMinutes = (outH * 60 + outM) - (inH * 60 + inM);

                if (diffInMinutes > 0) {
                    const h = Math.floor(diffInMinutes / 60);
                    const m = diffInMinutes % 60;
                    duration = `${h}j ${m}m`;
                }
            }

            // Status Badge
            const status = (record.status || '').toLowerCase();
            let statusBadge = '<span class="badge-status">Waiting</span>';
            if (status === 'ontime') {
                statusBadge = '<span class="badge-status success">Tepat Waktu</span>';
            } else if (status === 'terlambat' || status === 'late') {
                statusBadge = '<span class="badge-status warning">Terlambat</span>';
            }

            // Format date to local standard UI string
            const [y, m, d] = record.date.split('-');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
            const dateStr = `${d} ${months[parseInt(m) - 1] || m} ${y}`;

            return `
                <tr>
                    <td>${dateStr}</td>
                    <td>${record.shift || '-'}</td>
                    <td>${record.clockIn || '--:--'}</td>
                    <td>${record.clockOut || '--:--'}</td>
                    <td>${duration}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');
    },

    initLiveClock() {
        if (this.liveClockInterval) {
            clearInterval(this.liveClockInterval);
        }

        const updateClock = () => {
            const clockEl = document.getElementById('live-clock');
            const dateEl = document.getElementById('live-date');

            if (clockEl) clockEl.textContent = dateTime.getCurrentTime();
            if (dateEl) dateEl.textContent = dateTime.getCurrentDate();
        };

        updateClock();
        this.liveClockInterval = setInterval(updateClock, 1000);
    },

    initButtons() {
        // Clock In
        const btnClockIn = document.getElementById('btn-clock-in');
        if (btnClockIn) {
            btnClockIn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleClockIn();
            });
        }

        // Clock Out
        const btnClockOut = document.getElementById('btn-clock-out');
        if (btnClockOut) {
            btnClockOut.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleClockOut();
            });
        }
    },

    handleClockIn() {
        if (this.attendanceData.clockIn) return;

        // Navigate to face recognition first
        router.navigate('face-recognition');
        setTimeout(() => {
            if (window.faceRecognition) {
                window.faceRecognition.init('clock-in');
            }
        }, 100);
    },

    handleClockOut() {
        if (!this.attendanceData.clockIn || this.attendanceData.clockOut) return;

        // Navigate to face recognition
        router.navigate('face-recognition');
        setTimeout(() => {
            if (window.faceRecognition) {
                window.faceRecognition.init('clock-out');
            }
        }, 100);
    },

    // Process attendance after face recognition verification
    async processWithVerification(action, verificationData) {
        const now = new Date();
        const timeStr = dateTime.formatTime(now);

        switch (action) {
            case 'clock-in':
                this.attendanceData.clockIn = timeStr;
                this.attendanceData.status = 'ontime';
                this.currentState = 'clocked-in';
                toast.success(`Clock In berhasil: ${timeStr}`);
                break;
            case 'clock-out':
                this.attendanceData.clockOut = timeStr;
                this.currentState = 'completed';
                toast.success(`Clock Out berhasil: ${timeStr}`);
                break;
        }

        // Save verification data
        this.attendanceData.verification = {
            timestamp: verificationData.timestamp,
            location: verificationData.location,
            photo: verificationData.photo
        };

        await this.saveAttendance();
        this.updateUI();
        this.renderTimeline();

        // Clean up temp data
        storage.remove('temp_attendance');
    },

    async saveAttendance() {
        const currentUser = auth.getCurrentUser();
        this.attendanceData.userId = currentUser?.id || 'demo-user';

        try {
            const result = await api.saveAttendance(this.attendanceData);
            if (result && result.success && result.data) {
                // Keep the frontend in sync with server-calculated data (especially 'status')
                this.attendanceData = result.data;
            }
        } catch (error) {
            console.error('Error saving attendance:', error);
        }
    },

    updateUI() {
        // Update status ring
        const statusRing = document.querySelector('.status-ring');
        const statusText = document.querySelector('.status-text');
        const statusSubtext = document.querySelector('.status-subtext');

        if (statusRing) {
            statusRing.className = 'status-ring';

            switch (this.currentState) {
                case 'libur':
                    statusRing.classList.add('waiting');
                    if (statusText) statusText.textContent = 'Hari Libur';
                    if (statusSubtext) statusSubtext.textContent = 'Anda tidak memiliki jadwal kerja hari ini.';
                    break;
                case 'waiting':
                    statusRing.classList.add('waiting');
                    if (statusText) statusText.textContent = 'Siap Clock In';
                    if (statusSubtext) statusSubtext.textContent = 'Tekan tombol di bawah untuk memulai';
                    break;
                case 'clocked-in':
                    statusRing.classList.add('active');
                    if (statusText) statusText.textContent = 'Sedang Bekerja';
                    if (statusSubtext) statusSubtext.textContent = 'Semangat bekerja!';
                    break;
                case 'completed':
                    statusRing.classList.add('completed');
                    if (statusText) statusText.textContent = 'Selesai Bekerja';
                    if (statusSubtext) statusSubtext.textContent = 'Terima kasih atas kerja kerasnya!';
                    break;
            }
        }

        const btnClockIn = document.getElementById('btn-clock-in');
        const btnClockOut = document.getElementById('btn-clock-out');

        // Clock In button
        if (btnClockIn) {
            const isClockedIn = this.attendanceData.clockIn !== null && this.attendanceData.clockIn !== undefined;
            const isLibur = this.currentState === 'libur';

            btnClockIn.disabled = isClockedIn || isLibur;

            if (isClockedIn) {
                btnClockIn.classList.add('completed');
                const timeEl = document.getElementById('clock-in-time');
                if (timeEl) timeEl.textContent = this.attendanceData.clockIn;
            } else if (isLibur) {
                btnClockIn.classList.add('completed');
            } else {
                btnClockIn.classList.remove('completed');
            }
        }

        // Clock Out button
        if (btnClockOut) {
            btnClockOut.disabled = !this.attendanceData.clockIn || !!this.attendanceData.clockOut;
            if (this.attendanceData.clockOut) {
                btnClockOut.classList.add('completed');
                const timeEl = document.getElementById('clock-out-time');
                if (timeEl) timeEl.textContent = this.attendanceData.clockOut;
            }
        }
    },

    renderTimeline() {
        const timeline = document.getElementById('attendance-timeline');
        if (!timeline) return;

        const items = timeline.querySelectorAll('.timeline-item');

        items.forEach(item => {
            const type = item.dataset.type;
            const timeEl = item.querySelector('.timeline-time');

            item.className = 'timeline-item pending';

            switch (type) {
                case 'clock-in':
                    if (this.attendanceData.clockIn) {
                        item.classList.remove('pending');
                        item.classList.add('completed');
                        if (timeEl) timeEl.textContent = this.attendanceData.clockIn;
                    }
                    break;
                case 'clock-out':
                    if (this.attendanceData.clockOut) {
                        item.classList.remove('pending');
                        item.classList.add('completed');
                        if (timeEl) timeEl.textContent = this.attendanceData.clockOut;
                    }
                    break;
            }
        });

        // Set active state for the next step after Clock In
        if (this.currentState === 'clocked-in' && !this.attendanceData.clockOut) {
            const clockOutItem = timeline.querySelector('[data-type="clock-out"]');
            if (clockOutItem) clockOutItem.classList.add('active');
        }
    }
};

// Global init function
window.initAbsensi = () => {
    absensi.init();
};

window.absensi = absensi;
