/**
 * js/profil.js
 * Modul Halaman Profil Publik - FULL FIX v12.0.0 (FINAL)
 * ---------------------------------------------------------
 * CHANGELOG v12.0.0:
 *   ✅ FIX: Ambil foto dari sheet 'profil' dengan key 'foto_*'
 *   ✅ FIX: Tampilkan Sejarah + Visi Misi (fallback kalau kosong)
 *   ✅ FIX: Tampilkan Foto Pengurus Inti (grid)
 *   ✅ FIX: Struktur Pengurus + fallback
 *   ✅ FIX: Diagram jsPlumb di modal
 *   ✅ FIX: Semua section tampil walau kosong (tidak blank)
 *   ✅ FIX: Console logging detail untuk debug
 * ---------------------------------------------------------
 */

App.register('profil', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__profilLoaded) {
        console.log('[profil] Sudah di-init, skip.');
        return;
    }
    window.__profilLoaded = true;

    console.log('[profil] 🚀 Init dimulai v12.0.0');

    // ================================================================
    // 2. STATE
    // ================================================================
    let diagramInstance = null;
    let allProfilData = [];
    let fotoMap = {};

    // ================================================================
    // 3. HELPERS
    // ================================================================
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

    function formatKeyToLabel(key) {
        // 'foto_wakil_ketua' → 'Wakil Ketua'
        return String(key)
            .replace(/^foto_/, '')
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    async function ensureLib(name) {
        if (typeof window.loadLib === 'function') {
            try {
                await window.loadLib(name);
                return true;
            } catch (e) {
                console.warn('[profil] Gagal load lib ' + name + ':', e);
                return false;
            }
        }
        return false;
    }

    // ================================================================
    // 4. LOAD PROFIL (Sejarah, Visi Misi, Foto)
    // ================================================================
    async function loadProfilData() {
        console.log('[profil] 🔄 Loading profil data...');

        const sejarahEl = document.getElementById('profil-sejarah');
        const visiMisiEl = document.getElementById('profil-visi-misi');

        try {
            const res = await apiCall('getProfil', 'POST', {});

            if (!res || !res.success) {
                throw new Error((res && res.message) || 'Gagal memuat profil');
            }

            allProfilData = Array.isArray(res.data) ? res.data : [];
            console.log('[profil] ✅ Received ' + allProfilData.length + ' items from getProfil');

            // Build map
            const map = {};
            allProfilData.forEach(i => { map[i.key] = i.content; });

            // ✅ Sejarah
            if (sejarahEl) {
                const sejarah = (map['sejarah'] || '').trim();
                sejarahEl.innerHTML = sejarah
                    ? sejarah
                    : '<p class="text-[var(--text-muted)] italic">Sejarah organisasi belum diisi.</p>';
                console.log('[profil] Sejarah: ' + (sejarah ? sejarah.length + ' chars' : 'KOSONG'));
            }

            // ✅ Visi Misi
            if (visiMisiEl) {
                const visiMisi = (map['visi_misi'] || '').trim();
                visiMisiEl.innerHTML = visiMisi
                    ? visiMisi
                    : '<p class="text-[var(--text-muted)] italic">Visi & Misi belum diisi.</p>';
                console.log('[profil] Visi Misi: ' + (visiMisi ? visiMisi.length + ' chars' : 'KOSONG'));
            }

            // ✅ Build fotoMap
            fotoMap = {};
            allProfilData.forEach(item => {
                if (item.key && item.key.indexOf('foto_') === 0 && item.content) {
                    fotoMap[item.key] = String(item.content).trim();
                }
            });
            console.log('[profil] Foto map keys:', Object.keys(fotoMap));

            // ✅ Render foto pengurus
            renderFotoPengurus();

        } catch (e) {
            console.error('[profil] loadProfilData error:', e);
            const errHtml = '<p class="text-[var(--text-muted)] italic text-sm">Gagal memuat data. Silakan refresh halaman.</p>';
            if (sejarahEl) sejarahEl.innerHTML = errHtml;
            if (visiMisiEl) visiMisiEl.innerHTML = errHtml;
        }
    }

    // ================================================================
    // 5. RENDER FOTO PENGURUS
    // ================================================================
    function renderFotoPengurus() {
        console.log('[profil] 🎨 Rendering foto pengurus...');

        // Cari container
        let container = document.getElementById('profil-foto-pengurus');

        if (!container) {
            // Buat wrapper + container
            const strukturEl = document.getElementById('profil-struktur');
            const parentSection = strukturEl ? strukturEl.parentElement : null;

            if (!parentSection) {
                console.warn('[profil] Tidak ada parent untuk foto pengurus');
                return;
            }

            // Cek wrapper existing
            let wrapper = document.getElementById('profil-foto-pengurus-wrapper');
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.id = 'profil-foto-pengurus-wrapper';
                wrapper.className = 'mb-10';
                wrapper.innerHTML = `
                    <h3 class="text-xl md:text-2xl font-bold text-[var(--text-main)] font-amiri text-center mb-6">
                        <i class="fas fa-users-cog text-amber-500 mr-2"></i>Foto Pengurus Inti
                    </h3>
                    <div id="profil-foto-pengurus" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-w-4xl mx-auto"></div>
                `;
                // Insert sebelum struktur
                if (strukturEl && strukturEl.parentNode) {
                    strukturEl.parentNode.insertBefore(wrapper, strukturEl);
                } else {
                    parentSection.appendChild(wrapper);
                }
            }
            container = document.getElementById('profil-foto-pengurus');
        }

        if (!container) {
            console.warn('[profil] Container foto pengurus tidak ada');
            return;
        }

        const fotoKeys = Object.keys(fotoMap);

        if (fotoKeys.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-8 text-[var(--text-muted)]">
                    <i class="fas fa-camera text-3xl mb-2 opacity-40"></i>
                    <p class="text-sm">Belum ada foto pengurus yang diupload.</p>
                </div>
            `;
            console.log('[profil] ⚠️ No photo to render');
            return;
        }

        // Sort supaya konsisten
        fotoKeys.sort();

        let html = '';
        fotoKeys.forEach(key => {
            const label = formatKeyToLabel(key);
            const url = fotoMap[key];

            html += `
                <div class="flex flex-col items-center text-center p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <div class="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden mb-3 border-4 border-amber-400 shadow-md bg-[var(--bg-stats)]">
                        <img src="${escapeAttr(url)}" alt="${escapeAttr(label)}"
                            class="w-full h-full object-cover"
                            loading="lazy" decoding="async"
                            onerror="this.parentElement.innerHTML='<div class=&quot;w-full h-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white text-2xl font-bold&quot;>${escapeHtml(getInitials(label))}</div>'">
                    </div>
                    <div class="font-bold text-sm sm:text-base text-[var(--text-main)] leading-tight">
                        ${escapeHtml(label)}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        console.log('[profil] ✅ Rendered ' + fotoKeys.length + ' foto pengurus');
    }

    // ================================================================
    // 6. LOAD STRUKTUR
    // ================================================================
    async function loadStruktur() {
        console.log('[profil] 🔄 Loading struktur...');

        const container = document.getElementById('profil-struktur');
        if (!container) {
            console.warn('[profil] #profil-struktur tidak ada');
            return;
        }

        try {
            const res = await apiCall('getStruktur', 'POST', {});

            if (!res || !res.success) {
                throw new Error((res && res.message) || 'Gagal memuat struktur');
            }

            const data = (res.data || [])
                .slice()
                .sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0))
                .slice(0, 20);

            console.log('[profil] Struktur: ' + data.length + ' items');

            if (data.length === 0) {
                container.innerHTML = `
                    <p class="text-[var(--text-muted)] col-span-full text-center py-8 italic text-sm">
                        Belum ada data struktur organisasi.
                    </p>
                `;
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
            container.innerHTML = `
                <p class="text-[var(--text-muted)] col-span-full text-center py-8 italic text-sm">
                    Gagal memuat struktur.
                </p>
            `;
        }
    }

    // ================================================================
    // 7. LOAD DIAGRAM
    // ================================================================
    async function loadDiagram() {
        console.log('[profil] 🔄 Loading diagram...');

        const container = document.getElementById('diagram-container');
        const loading = document.getElementById('diagram-loading');

        if (diagramInstance) {
            try { diagramInstance.reset(); } catch (e) {}
            diagramInstance = null;
        }
        if (container) container.innerHTML = '';
        if (loading) {
            loading.style.display = 'block';
            loading.textContent = 'Memuat diagram...';
        }

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
                loading.textContent = 'Belum ada diagram struktur. Silakan atur di admin panel.';
                return;
            }

            let data;
            try {
                data = JSON.parse(item.content);
            } catch (e) {
                loading.textContent = 'Format diagram tidak valid.';
                return;
            }

            if (!data.nodes || data.nodes.length === 0) {
                loading.textContent = 'Diagram kosong.';
                return;
            }

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
                if (diagramInstance) {
                    try { diagramInstance.repaintEverything(); } catch (e) {}
                }
            }, 100);

            console.log('[profil] ✅ Diagram loaded: ' + (data.nodes || []).length + ' nodes');

        } catch (error) {
            console.error('[profil] loadDiagram error:', error);
            if (loading) loading.textContent = 'Error: ' + error.message;
        }
    }

    // ================================================================
    // 8. MODAL DIAGRAM
    // ================================================================
    function initDiagramModal() {
        const showBtn = document.getElementById('show-full-structure');
        const modal = document.getElementById('structure-modal');
        const closeBtn = document.getElementById('close-structure-modal');

        if (!showBtn || !modal) {
            console.log('[profil] Modal diagram tidak ada (skip)');
            return;
        }

        const freshShow = showBtn.cloneNode(true);
        showBtn.parentNode.replaceChild(freshShow, showBtn);

        freshShow.addEventListener('click', function(e) {
            e.preventDefault();
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.body.style.overflow = 'hidden';
            loadDiagram();
        });

        if (closeBtn) {
            const fresh = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(fresh, closeBtn);
            fresh.addEventListener('click', closeModal);
        }

        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });
    }

    function closeModal() {
        const modal = document.getElementById('structure-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
        if (diagramInstance) {
            try { diagramInstance.reset(); } catch (e) {}
            diagramInstance = null;
        }
    }

    // ================================================================
    // 9. INIT
    // ================================================================
    console.log('[profil] Init modal...');
    initDiagramModal();

    (async function() {
        console.log('[profil] Loading all data...');
        await Promise.allSettled([
            loadProfilData(),
            loadStruktur()
        ]);
        console.log('[profil] ✅ Init selesai v12.0.0');
    })();

});