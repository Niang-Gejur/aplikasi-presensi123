/**
 * Portal Karyawan - Admin Dashboard
 * Admin dashboard with employee statistics
 */

const adminDashboard = {
    employees: [],
    attendance: [],
    leaves: [],
    izin: [],
    journals: [],

    async init() {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        await this.loadData();
        this.updateStats();
        this.renderRecentActivity();
        this.renderOnlineUsers();
    },

    async loadData() {
        try {
            const [empResult, attResult, leaveResult, izinResult, jurnalResult] = await Promise.all([
                api.getEmployees(),
                api.getAllAttendance(),
                api.getAllLeaves(),
                api.getAllIzin(),
                api.getAllJournals()
            ]);
            this.employees = empResult.data || [];
            this.attendance = attResult.data || [];
            this.leaves = leaveResult.data || [];
            this.izin = izinResult.data || [];
            this.journals = jurnalResult.data || [];
        } catch (error) {
            console.error('Error loading admin data:', error);
            this.employees = storage.get('admin_employees', []);
            this.attendance = storage.get('attendance', []);
            this.leaves = storage.get('leaves', []);
            this.izin = storage.get('izin', []);
            this.journals = storage.get('jurnals', []);
        }
    },

    updateStats() {
        const totalEmployees = this.employees.length;
        const todayStr = dateTime.getLocalDate(); // yyyy-MM-dd

        // Filter attendance to ONLY today's records
        const todayAttendance = this.attendance.filter(a => a.date === todayStr);

        // Compute from real Today records
        let presentToday = 0;
        let lateToday = 0;

        todayAttendance.forEach(att => {
            if (att.clockIn) {
                presentToday++;
                // Check if late
                if (att.status && att.status.toLowerCase() === 'terlambat') {
                    lateToday++;
                }
            }
        });

        // Compute those on leave (sakit / izin) for today
        const onLeave = this.leaves.filter(l => l.status === 'approved' && l.startDate <= todayStr && l.endDate >= todayStr).length +
            this.izin.filter(i => i.status === 'approved' && i.date === todayStr).length;

        // Everyone not present and not on leave is absent
        const absentToday = Math.max(0, totalEmployees - presentToday - onLeave);

        // Count pending requests
        const pendingLeaves = this.leaves.filter(l => l.status === 'pending').length;
        const pendingIzin = this.izin.filter(i => i.status === 'pending').length;
        const totalPending = pendingLeaves + pendingIzin;

        // Update DOM
        const els = {
            'total-employees': totalEmployees,
            'present-today': presentToday,
            'absent-today': absentToday,
            'late-today': lateToday,
            'on-leave': onLeave,
            'pending-requests': totalPending
        };

        Object.entries(els).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                // Animate number
                this.animateNumber(el, parseInt(el.textContent) || 0, value);
            }
        });
    },

    animateNumber(element, start, end) {
        const duration = 1000;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(start + (end - start) * easeOutQuart);

            element.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    },

    // Waktu relatif, contoh: "5 menit yang lalu"
    timeAgo(date) {
        const diff = Math.floor((Date.now() - date.getTime()) / 1000);
        if (diff < 60) return 'Baru saja';
        if (diff < 3600) return `${Math.floor(diff / 60)} menit yang lalu`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} jam yang lalu`;
        if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} hari yang lalu`;
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    // Susun aktivitas terbaru dari data asli (absensi, jurnal, sakit, izin)
    buildRecentActivities() {
        const findEmp = (userId) => this.employees.find(e => String(e.id) === String(userId));
        const toDate = (value, time) => {
            if (!value) return null;
            const d = time ? new Date(`${value}T${time}`) : new Date(value);
            return isNaN(d.getTime()) ? null : d;
        };
        const events = [];
        const add = (userId, action, ts) => {
            const emp = findEmp(userId);
            if (!emp || !ts) return; // lewati data tanpa karyawan/waktu yang valid
            events.push({ user: emp.name, avatar: emp.avatar, action, ts });
        };

        this.attendance.forEach(a => {
            add(a.userId, 'Clock In', toDate(a.date, a.clockIn));
            if (a.clockOut) add(a.userId, 'Clock Out', toDate(a.date, a.clockOut));
        });
        this.journals.forEach(j => {
            add(j.userId, 'Mengisi Jurnal', toDate(j.updatedAt) || toDate(j.date));
        });
        this.leaves.forEach(l => {
            add(l.userId, 'Mengajukan Sakit', toDate(l.appliedAt) || toDate(l.startDate));
        });
        this.izin.forEach(i => {
            const label = i.type === 'sick' ? 'Mengajukan Sakit' : 'Mengajukan Izin';
            add(i.userId, label, toDate(i.appliedAt) || toDate(i.date));
        });

        return events.sort((x, y) => y.ts - x.ts).slice(0, 5);
    },

    renderRecentActivity() {
        const container = document.getElementById('admin-recent-activity');
        if (!container) return;

        const activities = this.buildRecentActivities();

        if (activities.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <p>Belum ada aktivitas.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = activities.map(act => `
            <div class="activity-item">
                <div class="activity-avatar">
                    <img src="${getAvatarUrl({ name: act.user, avatar: act.avatar })}" alt="${act.user}">
                </div>
                <div class="activity-content">
                    <p class="activity-text"><strong>${act.user}</strong> ${act.action}</p>
                    <span class="activity-time">${this.timeAgo(act.ts)}</span>
                </div>
            </div>
        `).join('');
    },

    renderOnlineUsers() {
        const container = document.getElementById('admin-online-users');
        if (!container) return;

        const onlineUsers = this.employees.filter(e => e.status === 'active').slice(0, 5);
        const onlineCount = onlineUsers.length;

        const countEl = document.getElementById('online-count');
        if (countEl) countEl.textContent = onlineCount;

        container.innerHTML = onlineUsers.map(user => `
            <div class="online-user-item">
                <div class="user-status-dot"></div>
                <div class="activity-avatar">
                    <img src="${getAvatarUrl(user)}" alt="${user.name}">
                </div>
                <div class="activity-content">
                    <p class="activity-text"><strong>${user.name}</strong></p>
                    <span class="activity-time">${user.department} - ${user.position}</span>
                </div>
            </div>
        `).join('');
    },

    // Charts initialization (placeholder - would use Chart.js in production)
    initCharts() {
        // This would be where Chart.js or similar library is initialized
        // For now, we'll just show placeholders
        const attendanceChart = document.getElementById('admin-attendance-chart');
        const deptChart = document.getElementById('admin-dept-chart');

        if (attendanceChart) {
            attendanceChart.innerHTML = `
                <div class="chart-placeholder">
                    <i class="fas fa-chart-bar"></i>
                    <p>Grafik Kehadiran 30 Hari Terakhir</p>
                </div>
            `;
        }

        if (deptChart) {
            deptChart.innerHTML = `
                <div class="chart-placeholder">
                    <i class="fas fa-chart-pie"></i>
                    <p>Distribusi Kehadiran per Departemen</p>
                </div>
            `;
        }
    }
};

// Global init function
window.initAdminDashboard = () => {
    adminDashboard.init();
    adminDashboard.initCharts();
};

// Expose
window.adminDashboard = adminDashboard;
