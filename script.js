document.addEventListener('DOMContentLoaded', () => {
    let uploadedFiles = [];
    let allResults = []; 
    let chartD, chartC;

    const fileInput = document.getElementById('fileInput');
    const tableSearch = document.getElementById('tableSearch');
    const filterStatus = document.getElementById('filterStatus');

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
        document.getElementById('fileStatus').innerText = `${uploadedFiles.length} Arquivos`;

        const cols = Object.keys(uploadedFiles[0].data[0] || {});
        const sel = document.getElementById('columnAnalytic');
        
        sel.innerHTML = cols.map(c => `<option value="${c}">${c}</option>`).join('');
        sel.onchange = () => updateColumnChart(sel.value);

        processComparison();
        updateColumnChart(cols[0]);
    }

    function processComparison() {
        const t1 = uploadedFiles[0].data;
        const t2 = (uploadedFiles[1] || {data: []}).data;
        const keys = Object.keys(t1[0] || {});
        allResults = [];

        t1.forEach((row, i) => {
            const row2 = t2[i] || {};
            let diffObj = { "_id": i + 1, "_hasDiff": false };
            
            keys.forEach(k => {
                if (uploadedFiles.length > 1 && row[k] !== row2[k]) {
                    diffObj["_hasDiff"] = true;
                    diffObj[k] = `${row[k] || 'Ø'} ⮕ ${row2[k] || 'Ø'}`; // Destaque visual
                } else {
                    diffObj[k] = row[k];
                }
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
            const matchesStatus = filter === 'all' ? true : row._hasDiff;
            return matchesSearch && matchesStatus;
        });

        // Cálculos de KPI
        const totalRows = allResults.length;
        const diffCount = allResults.filter(r => r._hasDiff).length;
        const accuracy = totalRows > 0 ? (((totalRows - diffCount) / totalRows) * 100).toFixed(1) : 0;

        document.getElementById('totalRows').innerText = totalRows.toLocaleString();
        document.getElementById('totalDiffs').innerText = diffCount.toLocaleString();
        document.getElementById('accuracyRate').innerText = `${accuracy}%`;
        document.getElementById('totalCols').innerText = keys.length;

        // Renderização da Tabela
        document.getElementById('tableHeader').innerHTML = `<tr><th>REF</th>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
        document.getElementById('tableBody').innerHTML = filtered.slice(0, 100).map(d => `
            <tr class="${d._hasDiff ? 'diff-row' : ''}">
                <td class="opacity-30 font-mono text-[9px]">${d._id}</td>
                ${keys.map(k => {
                    const isDiff = String(d[k]).includes('⮕');
                    return `<td class="${isDiff ? 'text-yellow-500 font-bold' : ''}" title="${d[k]}">${d[k]}</td>`;
                }).join('')}
            </tr>
        `).join('');

        if(uploadedFiles.length > 1) {
            document.getElementById('btnExport').classList.remove('hidden');
            updatePieChart(diffCount, totalRows);
        }
    }

    function updatePieChart(diffs, total) {
        const ctx = document.getElementById('chartDiff').getContext('2d');
        if(chartD) chartD.destroy();
        chartD = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Divergências', 'Iguais'],
                datasets: [{ data: [diffs, total - diffs], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }]
            },
            options: { cutout: '80%', plugins: { legend: { display: false } } }
        });
    }

    function updateColumnChart(col) {
        const counts = {};
        uploadedFiles[0].data.forEach(r => { counts[r[col]] = (counts[r[col]] || 0) + 1; });
        const ctx = document.getElementById('chartColumns').getContext('2d');
        if(chartC) chartC.destroy();
        chartC = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(counts).slice(0, 5),
                datasets: [{ data: Object.values(counts).slice(0, 5), backgroundColor: '#3b82f6', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    tableSearch.addEventListener('input', renderUI);
    filterStatus.addEventListener('change', renderUI);
    document.getElementById('btnClear').onclick = () => location.reload();
    document.getElementById('btnExport').onclick = () => {
        const ws = XLSX.utils.json_to_sheet(allResults);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
        XLSX.writeFile(wb, "BI_Analytics_Export.xlsx");
    };
});