/**
 * Portal Karyawan - Sakit (sebelumnya Cuti)
 * Sick leave request functionality
 * Catatan: nama objek, ID elemen, dan fungsi API tetap memakai "cuti/leave"
 * agar kompatibel dengan router, HTML, dan backend yang sudah ada.
 */

const cuti = {
    leaves: [],
    filterStatus: '',

    async init() {
        await this.loadLeaves();
        this.initForm();
        this.initFilters();
        this.renderLeaveList();
        this.updateStats();
    },

    async loadLeaves() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        try {
            const result = auth.isAdmin() ? await api.getAllLeaves() : await api.getLeaves(userId);
            this.leaves = result.data || [];
        } catch (error) {
            console.error('Error loading leaves:', error);
            this.leaves = storage.get('leaves', []);
        }
    },

    initForm() {
        const form = document.getElementById('cuti-form');
        if (form && !form.dataset.bound) {
            form.dataset.bound = 'true';
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        // Auto-calculate duration when dates change
        const startDate = document.getElementById('leave-start');
        const endDate = document.getElementById('leave-end');
        const duration = document.getElementById('leave-duration');
        if (!startDate || !endDate || !duration) return;

        const calculateDuration = () => {
            if (startDate.value && endDate.value) {
                const start = new Date(startDate.value);
                const end = new Date(endDate.value);
                const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                duration.value = diffDays > 0 ? `${diffDays} hari` : '0 hari';
            }
        };

        if (!startDate.dataset.bound) {
            startDate.dataset.bound = 'true';
            startDate.addEventListener('change', calculateDuration);
        }
        if (!endDate.dataset.bound) {
            endDate.dataset.bound = 'true';
            endDate.addEventListener('change', calculateDuration);
        }
    },

    async handleSubmit(e) {
        e.preventDefault();

        const startDate = document.getElementById('leave-start');
        const endDate = document.getElementById('leave-end');
        const reason = document.getElementById('leave-reason');

        if (!startDate.value || !endDate.value || !reason.value.trim()) {
            toast.error('Semua field harus diisi!');
            return;
        }

        // Calculate duration
        const start = new Date(startDate.value);
        const end = new Date(endDate.value);
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays <= 0) {
            toast.error('Tanggal selesai harus setelah tanggal mulai!');
            return;
        }

        const currentUser = auth.getCurrentUser();

        // Jenis selalu "sick"
        const leaveData = {
            userId: currentUser?.id || 'demo-user',
            type: 'sick',
            typeLabel: 'Sakit',
            startDate: startDate.value,
            endDate: endDate.value,
            duration: diffDays,
            reason: reason.value.trim()
        };

        try {
            const result = await api.submitLeave(leaveData);
            if (result.success) {
                this.leaves.unshift(result.data);
                toast.success('Pengajuan sakit berhasil dikirim!');
            } else {
                toast.error(result.error || 'Gagal mengajukan sakit');
            }
        } catch (error) {
            console.error('Error submitting leave:', error);
            toast.error('Terjadi kesalahan');
        }

        // Reset form
        e.target.reset();
        document.getElementById('leave-duration').value = '';

        this.renderLeaveList();
        this.updateStats();
    },

    initFilters() {
        const statusFilter = document.querySelector('.cuti-history-card .select-filter');
        if (statusFilter && !statusFilter.dataset.bound) {
            statusFilter.dataset.bound = 'true';
            statusFilter.addEventListener('change', (e) => {
                this.filterStatus = e.target.value === 'Semua Status' ? '' : e.target.value.toLowerCase();
                this.renderLeaveList();
            });
        }
    },

    updateStats() {
        const pending = this.leaves.filter(l => l.status === 'pending').length;
        const approved = this.leaves.filter(l => l.status === 'approved').length;
        const rejected = this.leaves.filter(l => l.status === 'rejected').length;

        const statValues = document.querySelectorAll('.leave-stats .stat-value');
        if (statValues.length >= 3) {
            statValues[0].textContent = pending;
            statValues[1].textContent = approved;
            statValues[2].textContent = rejected;
        }
    },

    renderLeaveList() {
        const list = document.getElementById('leave-list');
        if (!list) return;

        // Filter leaves
        const filteredLeaves = this.leaves.filter(l => {
            if (!this.filterStatus) return true;
            if (this.filterStatus === 'menunggu') return l.status === 'pending';
            if (this.filterStatus === 'disetujui') return l.status === 'approved';
            if (this.filterStatus === 'ditolak') return l.status === 'rejected';
            return true;
        });

        if (filteredLeaves.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: var(--spacing);"></i>
                    <p>${this.filterStatus ? 'Tidak ada pengajuan yang sesuai' : 'Belum ada pengajuan sakit'}</p>
                </div>
            `;
            return;
        }

        // Sort by applied date descending
        const sortedLeaves = filteredLeaves.sort((a, b) =>
            new Date(b.appliedAt) - new Date(a.appliedAt)
        );

        list.innerHTML = sortedLeaves.map(leave => {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            const startFormatted = dateTime.formatDate(start, 'short');
            const endFormatted = dateTime.formatDate(end, 'short');

            let dateDisplay = startFormatted;
            if (leave.startDate !== leave.endDate) {
                dateDisplay = `${startFormatted} - ${endFormatted}`;
            }

            return `
                <div class="leave-item">
                    <div class="leave-icon">
                        <i class="fas fa-notes-medical"></i>
                    </div>
                    <div class="leave-content">
                        <div class="leave-header">
                            <h4 class="leave-type">Sakit</h4>
                            <span class="leave-status ${leave.status}">${this.getStatusLabel(leave.status)}</span>
                        </div>
                        <div class="leave-details">
                            <span class="leave-date">
                                <i class="fas fa-calendar"></i>
                                ${dateDisplay} (${leave.duration} hari)
                            </span>
                        </div>
                        <p class="leave-reason">${leave.reason}</p>
                    </div>
                </div>
            `;
        }).join('');
    },

    getStatusLabel(status) {
        const labels = {
            pending: 'Menunggu',
            approved: 'Disetujui',
            rejected: 'Ditolak'
        };
        return labels[status] || status;
    },

    // Admin functions
    async approveLeave(id) {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            return;
        }

        try {
            await api.approveLeave(id);
            const leave = this.leaves.find(l => l.id === id);
            if (leave) { leave.status = 'approved'; }
            this.renderLeaveList();
            this.updateStats();
            toast.success('Pengajuan sakit disetujui!');
        } catch (error) {
            console.error('Error approving leave:', error);
        }
    },

    async rejectLeave(id) {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            return;
        }

        try {
            await api.rejectLeave(id);
            const leave = this.leaves.find(l => l.id === id);
            if (leave) { leave.status = 'rejected'; }
            this.renderLeaveList();
            this.updateStats();
            toast.info('Pengajuan sakit ditolak!');
        } catch (error) {
            console.error('Error rejecting leave:', error);
        }
    }
};

// Global init function
window.initCuti = () => {
    cuti.init();
};

// Expose cuti object
window.cuti = cuti;
