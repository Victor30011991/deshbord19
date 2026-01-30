let uploadedFiles = [];
let allResults = []; 
let chartD, chartC;

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const tableSearch = document.getElementById('tableSearch');
    const filterStatus = document.getElementById('filterStatus');
    const cleanToggle = document.getElementById('cleanDataMode');

    fileInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        for (let file of files) {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            uploadedFiles.push({ data: json });
        }
        initDashboard();
    };

    function initDashboard() {
        if (uploadedFiles.length === 0) return;
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
        const clean = cleanToggle.checked;
        allResults = [];

        t1.forEach((row, i) => {
            const row2 = t2[i] || {};
            let res = { _id: i + 1, _diff: false, _rel: (row[keys[0]] === row2[keys[0]]) };
            keys.forEach(k => {
                let v1 = String(row[k] || ''), v2 = String(row2[k] || '');
                if(clean) { v1 = v1.trim().toLowerCase(); v2 = v2.trim().toLowerCase(); }
                if(uploadedFiles.length > 1 && v1 !== v2) {
                    res._diff = true;
                    res[k] = `${row[k] || 'Ø'} ⮕ ${row2[k] || 'Ø'}`;
                } else { res[k] = row[k]; }
            });
            allResults.push(res);
        });
        render();
    }

    function render() {
        const query = tableSearch.value.toLowerCase();
        const mode = filterStatus.value;
        const keys = Object.keys(uploadedFiles[0].data[0] || {});
        
        const filtered = allResults.filter(r => {
            const match = Object.values(r).some(v => String(v).toLowerCase().includes(query));
            if(mode === 'diff') return match && r._diff;
            if(mode === 'related') return match && r._rel;
            return match;
        });

        const d = allResults.filter(r => r._diff).length;
        const t = allResults.length;
        document.getElementById('totalRows').innerText = t.toLocaleString();
        document.getElementById('totalDiffs').innerText = d.toLocaleString();
        document.getElementById('accuracyRate').innerText = t > 0 ? `${((t-d)/t*100).toFixed(1)}%` : '0%';
        document.getElementById('equalCounter').innerText = (t - d).toLocaleString();
        document.getElementById('diffCounter').innerText = d.toLocaleString();

        document.getElementById('tableHeader').innerHTML = `<tr><th>REF</th>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
        document.getElementById('tableBody').innerHTML = filtered.slice(0, 300).map(r => `
            <tr class="${r._diff ? 'diff-row' : ''}">
                <td class="opacity-30 font-mono text-[9px]">${r._id}</td>
                ${keys.map(k => `<td class="${String(r[k]).includes('⮕') ? 'text-yellow-500' : ''}">${r[k]}</td>`).join('')}
            </tr>
        `).join('');

        document.getElementById('exportGroup').classList.remove('hidden');
        updateCharts(d, t);
    }

    // DOWNLOAD EXCEL
    window.exportExcel = () => {
        const dataToExport = allResults.map(({_id, _diff, _rel, ...rest}) => rest);
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
        XLSX.writeFile(wb, "Relatorio_BI_Enterprise.xlsx");
    };

    // DOWNLOAD PDF
    window.exportPDF = () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        const dataToExport = allResults.map(r => Object.values(r).slice(3));
        const headers = [Object.keys(allResults[0]).slice(3)];
        doc.autoTable({
            head: headers,
            body: dataToExport,
            startY: 20,
            theme: 'grid',
            styles: { fontSize: 7 }
        });
        doc.save("Relatorio_Auditoria.pdf");
    };

    function updateCharts(d, t) {
        if(chartD) chartD.destroy();
        chartD = new Chart(document.getElementById('chartDiff'), {
            type: 'doughnut',
            data: { datasets: [{ data: [d, t-d], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }] },
            options: { cutout: '80%' }
        });
    }

    function updateColumnChart(col) {
        const counts = {};
        uploadedFiles[0].data.forEach(r => { let v = r[col] || 'Ø'; counts[v] = (counts[v] || 0) + 1; });
        const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10);
        if(chartC) chartC.destroy();
        chartC = new Chart(document.getElementById('chartColumns'), {
            type: 'bar',
            data: { labels: sorted.map(i=>i[0]), datasets: [{ data: sorted.map(i=>i[1]), backgroundColor: '#3b82f6' }] },
            options: { indexAxis: 'y', plugins: { legend: { display: false } } }
        });
    }

    tableSearch.oninput = render;
    filterStatus.onchange = render;
    cleanToggle.onchange = processComparison;
    document.getElementById('btnExcel').onclick = exportExcel;
    document.getElementById('btnPDF').onclick = exportPDF;
});
