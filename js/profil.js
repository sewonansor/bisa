/**
 * js/profil.js
 * Modul Halaman Profil Publik - FULL FIX v10.0.0 (FINAL)
 */

App.register('profil', function() {
    'use strict';

    // ===== GUARD =====
    if (window.__profilLoaded) return;
    window.__profilLoaded = true;

    // ===== STATE =====
    let diagramInstance = null;

    // ===== HELPERS =====
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getInitials(name) {
        if (!name) return '?';
        const parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    async function ensureLib(name) {
        if (typeof window.loadLib === 'function') {
            try { await window.loadLib(name); return true; }
            catch (e) { console.warn('[profil] Gagal load lib:', name, e); return false; }
        }
        return false;
    }

    // ===== LOAD PROFIL (Sejarah + Visi Misi) =====
    async function loadProfilData() {
        const sejarahEl = document.getElementById('profil-sejarah');
        const visiMisiEl = document.getElementById('profil-visi-misi');

        try {
            const res = await apiCall('getProfil', 'POST', {});
            if (!res || !res.success) throw new Error((res && res.message) || 'Gagal memuat profil');

            const map = {};
            (res.data || []).forEach(i => { map[i.key] = i.content; });

            if (sejarahEl) {
                sejarahEl.innerHTML = map['sejarah'] ||
                    '<p class="text-[var(--text-muted)] italic">Belum ada data sejarah.</p>';
            }
            if (visiMisiEl) {
                visiMisiEl.innerHTML = map['visi_misi'] ||
                    '<p class="text-[var(--text-muted)] italic">Belum ada data visi misi.</p>';
            }
        } catch (e) {
            console.error('[profil] loadProfilData error:', e);
            const errHtml = '<p class="text-[var(--text-muted)] italic text-sm">Gagal memuat data.</p>';
            if (sejarahEl) sejarahEl.innerHTML = errHtml;
            if (visiMisiEl) visiMisiEl.innerHTML = errHtml;
        }
    }

    // ===== LOAD STRUKTUR =====
    async function loadStruktur() {
        const container = document.getElementById('profil-struktur');
        if (!container) return;

        try {
            const res = await apiCall('getStruktur', 'POST', {});
            if (!res || !res.success) throw new Error((res && res.message) || 'Gagal memuat struktur');

            const data = (res.data || []).slice().sort((a, b) =>
                (Number(a.urutan) || 0) - (Number(b.urutan) || 0)
            ).slice(0, 5);

            if (data.length === 0) {
                container.innerHTML = '<p class="text-[var(--text-muted)] col-span-full text-center py-8 italic text-sm">Belum ada data struktur organisasi.</p>';
                return;
            }

            container.innerHTML = data.map(item => {
                const foto = item.foto_url || '';
                const initials = getInitials(item.nama);
                const imgHtml = foto
                    ? `<img src="${escapeAttr(foto)}" alt="${escapeAttr(item.nama)}"
                            class="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover mb-3 shadow-sm border border-[var(--card-border)]"
                            loading="lazy" decoding="async"
                            onerror="this.outerHTML='<div class=&quot;w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white text-lg font-bold mb-3&quot;>${escapeHtml(initials)}</div>'">`
                    : `<div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white text-lg font-bold mb-3">
                            ${escapeHtml(initials)}
                       </div>`;

                return `
                    <div class="flex flex-col items-center text-center p-3 rounded-lg hover:bg-[var(--card-border)] transition">
                        ${imgHtml}
                        <div class="font-medium text-xs sm:text-sm text-[var(--text-main)] leading-tight">${escapeHtml(item.nama || '-')}</div>
                        <div class="text-xs text-[var(--text-muted)] font-medium mt-0.5">${escapeHtml(item.jabatan || '-')}</div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('[profil] loadStruktur error:', e);
            container.innerHTML = '<p class="text-[var(--text-muted)] col-span-full text-center py-8 italic text-sm">Gagal memuat struktur.</p>';
        }
    }

    // ===== LOAD DIAGRAM (jsPlumb) =====
    async function loadDiagram() {
        const container = document.getElementById('diagram-container');
        const loading = document.getElementById('diagram-loading');

        if (diagramInstance) { try { diagramInstance.reset(); } catch (e) {} diagramInstance = null; }
        if (container) container.innerHTML = '';
        if (loading) { loading.style.display = 'block'; loading.textContent = 'Memuat diagram...'; }

        await ensureLib('jsplumb');
        if (typeof jsPlumb === 'undefined') {
            if (loading) loading.textContent = '⚠️ Pustaka diagram gagal dimuat.';
            return;
        }

        try {
            const res = await apiCall('getProfil', 'POST', {});
            if (!res || !res.success || !container || !loading) return;

            const item = (res.data || []).find(p => p.key === 'struktur_diagram');
            if (!item || !item.content) {
                loading.textContent = 'Belum ada diagram struktur.';
                return;
            }

            const data = JSON.parse(item.content);
            loading.style.display = 'none';

            diagramInstance = jsPlumb.getInstance({
                Connector: ['Straight', { gap: 5 }],
                PaintStyle: { strokeWidth: 2, stroke: '#0f2922' },
                Endpoint: ['Rectangle', { width: 12, height: 12 }],
                EndpointStyle: { fill: '#0f2922' },
                Anchors: ['Right', 'Left', 'Top', 'Bottom'],
                Container: container
            });

            (data.nodes || []).forEach(n => {
                const node = document.createElement('div');
                node.id = n.id;
                node.className = 'node-box';
                node.style.left = (n.x || 0) + 'px';
                node.style.top = (n.y || 0) + 'px';
                node.style.width = (n.width || 120) + 'px';
                node.style.height = (n.height || 50) + 'px';
                node.textContent = n.label || '';
                container.appendChild(node);
                try {
                    diagramInstance.addEndpoint(n.id, { anchor: 'Right', uuid: n.id + '-right' });
                    diagramInstance.addEndpoint(n.id, { anchor: 'Left', uuid: n.id + '-left' });
                    diagramInstance.addEndpoint(n.id, { anchor: 'Top', uuid: n.id + '-top' });
                    diagramInstance.addEndpoint(n.id, { anchor: 'Bottom', uuid: n.id + '-bottom' });
                } catch (e) {}
            });

            (data.connections || []).forEach(c => {
                try {
                    diagramInstance.connect({ uuids: [c.source + '-bottom', c.target + '-top'] });
                } catch (e) {}
            });

            setTimeout(() => {
                if (diagramInstance) try { diagramInstance.repaintEverything(); } catch (e) {}
            }, 100);
        } catch (error) {
            console.error('[profil] loadDiagram error:', error);
            if (loading) loading.textContent = 'Error: ' + error.message;
        }
    }

    // ===== MODAL =====
    function initDiagramModal() {
        const showBtn = document.getElementById('show-full-structure');
        const modal = document.getElementById('structure-modal');
        const closeBtn = document.getElementById('close-structure-modal');

        if (!showBtn || !modal) return;

        const freshShow = showBtn.cloneNode(true);
        showBtn.parentNode.replaceChild(freshShow, showBtn);

        freshShow.addEventListener('click', function() {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            loadDiagram();
        });

        if (closeBtn) {
            const fresh = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(fresh, closeBtn);
            fresh.addEventListener('click', closeModal);
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
        });
    }

    function closeModal() {
        const modal = document.getElementById('structure-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        if (diagramInstance) { try { diagramInstance.reset(); } catch (e) {} diagramInstance = null; }
    }

    // ===== INIT =====
    console.log('[profil] Init dimulai');
    initDiagramModal();

    (async function() {
        await Promise.allSettled([
            loadProfilData(),
            loadStruktur()
        ]);
    })();
});