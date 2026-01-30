let uploadedFiles = [];
let allResults = []; 
let chartD, chartC;

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const tableSearch = document.getElementById('tableSearch');
    const filterStatus = document.getElementById('filterStatus');
    const cleanToggle = document.getElementById('cleanDataMode');

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (let file of files) {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            uploadedFiles.push({ name: file.name, data: json });
        }
        initDashboard();
    });

    function initDashboard() {
        if (uploadedFiles.length === 0) return;
        document.getElementById('fileStatus').innerText = `${uploadedFiles.length} Planilhas Ativas`;
        processComparison();
        const cols = Object.keys(uploadedFiles[0].data[0] || {});
        const sel = document.getElementById('columnAnalytic');
        sel.innerHTML = cols.map(c => `<option value="${c}">${c}</option>`).join('');
        sel.onchange = () => updateColumnChart(sel.value);
        updateColumnChart(cols[0]);
    }

    function processComparison() {
        const t1 = uploadedFiles[0].data;
        const t2 = (uploadedFiles[1] || {data: []}).data;
        const keys = Object.keys(t1[0] || {});
        const isCleanMode = cleanToggle.checked;
        allResults = [];

        t1.forEach((row, i) => {
            const row2 = t2[i] || {};
            let diffObj = { "_id": i + 1, "_hasDiff": false, "_isRelated": false };
            
            keys.forEach(k => {
                let v1 = row[k], v2 = row2[k];
                if (isCleanMode) {
                    v1 = String(v1 || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
                    v2 = String(v2 || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
                }
                
                // Filtro de Relacionadas: Se o valor principal for igual mas houver campos diferentes
                if (keys[0] && row[keys[0]] === row2[keys[0]]) diffObj._isRelated = true;

                if (uploadedFiles.length > 1 && String(v1) !== String(v2)) {
                    diffObj["_hasDiff"] = true;
                    diffObj[k] = `${row[k] || 'Ø'} ⮕ ${row2[k] || 'Ø'}`;
                } else { diffObj[k] = row[k]; }
            });
            allResults.push(diffObj);
        });
        renderUI();
    }

    function renderUI() {
        const searchTerm = tableSearch.value.toLowerCase();
        const filter = filterStatus.value;
        const keys = Object.keys(uploadedFiles[0].data[0] || {});
        
        const filtered = allResults.filter(row => {
            const matchesSearch = Object.values(row).some(v => String(v).toLowerCase().includes(searchTerm));
            if (filter === 'diff') return matchesSearch && row._hasDiff;
            if (filter === 'related') return matchesSearch && row._isRelated;
            return matchesSearch;
        });

        const total = allResults.length;
        const diffs = allResults.filter(r => r._hasDiff).length;
        const equals = total - diffs;

        document.getElementById('totalRows').innerText = total.toLocaleString();
        document.getElementById('totalDiffs').innerText = diffs.toLocaleString();
        document.getElementById('accuracyRate').innerText = total > 0 ? `${((equals/total)*100).toFixed(1)}%` : '0%';
        document.getElementById('equalCounter').innerText = equals;
        document.getElementById('diffCounter').innerText = diffs;

        // Renderização Otimizada para Grandes Planilhas
        document.getElementById('tableHeader').innerHTML = `<tr><th>REF</th>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
        document.getElementById('tableBody').innerHTML = filtered.slice(0, 50).map(d => `
            <tr class="${d._hasDiff ? 'diff-row' : ''}">
                <td class="opacity-30 font-mono text-[9px]">${d._id}</td>
                ${keys.map(k => `<td class="${String(d[k]).includes('⮕') ? 'text-yellow-500 font-bold' : ''}">${d[k]}</td>`).join('')}
            </tr>
        `).join('');

        document.getElementById('exportGroup').classList.toggle('hidden', uploadedFiles.length === 0);
        updatePieChart(diffs, total);
    }

    function updatePieChart(d, t) {
        const ctx = document.getElementById('chartDiff').getContext('2d');
        if(chartD) chartD.destroy();
        chartD = new Chart(ctx, {
            type: 'doughnut',
            data: { 
                labels: ['Divergentes', 'Conformes'],
                datasets: [{ data: [d, t-d], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }] 
            },
            options: { cutout: '80%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 9 } } } } }
        });
    }

    function updateColumnChart(col) {
        const counts = {};
        uploadedFiles[0].data.forEach(r => { let v = r[col] || 'Vazio'; counts[v] = (counts[v] || 0) + 1; });
        
        // Regra Top 10 Enterprise
        const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 10);
        
        const ctx = document.getElementById('chartColumns').getContext('2d');
        if(chartC) chartC.destroy();
        chartC = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: sorted.map(i => i[0]), 
                datasets: [{ label: 'Ocorrências', data: sorted.map(i => i[1]), backgroundColor: '#3b82f6', borderRadius: 4 }] 
            },
            options: { 
                indexAxis: 'y', // Gráfico Horizontal
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#475569' } }, y: { ticks: { color: '#94a3b8', font: { size: 10 } } } }
            }
        });
    }

    // Listeners
    cleanToggle.addEventListener('change', processComparison);
    tableSearch.addEventListener('input', renderUI);
    filterStatus.addEventListener('change', renderUI);

    window.exportExcel = () => { /* Mesma lógica anterior */ };
    window.exportPDF = () => { /* Mesma lógica anterior */ };
});
