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
        document.getElementById('fileStatus').innerText = `${uploadedFiles.length} Ficheiros`;

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
                // Comparação rigorosa para detetar divergências
                if (uploadedFiles.length > 1 && String(row[k]) !== String(row2[k])) {
                    diffObj["_hasDiff"] = true;
                    diffObj[k] = `${row[k] || 'Ø'} ⮕ ${row2[k] || 'Ø'}`;
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

        // ATUALIZAÇÃO DOS NÚMEROS (KPIs)
        const totalRows = allResults.length;
        const diffCount = allResults.filter(r => r._hasDiff).length;
        const accuracy = totalRows > 0 ? (((totalRows - diffCount) / totalRows) * 100).toFixed(1) : 0;

        document.getElementById('totalRows').innerText = totalRows.toLocaleString();
        document.getElementById('totalDiffs').innerText = diffCount.toLocaleString();
        document.getElementById('accuracyRate').innerText = `${accuracy}%`;
        document.getElementById('totalCols').innerText = keys.length;
        document.getElementById('diffCounter').innerText = `${diffCount} Divergências`;

        document.getElementById('tableHeader').innerHTML = `<tr><th>REF</th>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
        document.getElementById('tableBody').innerHTML = filtered.slice(0, 100).map(d => `
            <tr class="${d._hasDiff ? 'diff-row' : ''}">
                <td class="opacity-30 font-mono text-[9px]">${d._id}</td>
                ${keys.map(k => {
                    const isDiff = String(d[k]).includes('⮕');
                    return `<td class="${isDiff ? 'text-yellow-500 font-bold' : ''}">${d[k]}</td>`;
                }).join('')}
            </tr>
        `).join('');

        // MOSTRAR BOTÕES DE EXPORTAÇÃO SE HOUVER DADOS
        if(uploadedFiles.length > 0) {
            document.getElementById('exportGroup').classList.remove('hidden');
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
        uploadedFiles[0].data.forEach(r => { 
            const val = r[col] || "Vazio";
            counts[val] = (counts[val] || 0) + 1; 
        });
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

    // FUNÇÕES DE EXPORTAÇÃO TORNADAS GLOBAIS
    window.exportExcel = function() {
        const ws = XLSX.utils.json_to_sheet(allResults.map(({_hasDiff, ...rest}) => rest));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
        XLSX.writeFile(wb, "BI_Analytics_Export.xlsx");
    };

    window.exportPDF = function() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        const keys = Object.keys(uploadedFiles[0].data[0] || {});
        doc.text("Relatório de Auditoria BI", 14, 15);
        doc.autoTable({
            startY: 20,
            head: [['REF', ...keys]],
            body: allResults.map(r => [r._id, ...keys.map(k => r[k])]),
            styles: { fontSize: 7 }
        });
        doc.save("Relatorio_BI.pdf");
    };
});
