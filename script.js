let uploadedFiles = [];
let globalDiffs = [];
let globalEquals = [];

document.getElementById('fileInput').addEventListener('change', async function(e) {
    const files = Array.from(e.target.files);
    for (let file of files) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        uploadedFiles.push({ name: file.name, data: json });
    }
    initBI();
});

function initBI() {
    if (uploadedFiles.length === 0) return;
    
    const cols = Object.keys(uploadedFiles[0].data[0] || {});
    const sel = document.getElementById('columnAnalytic');
    sel.innerHTML = cols.map(c => `<option value="${c}">${c}</option>`).join('');
    sel.onchange = () => updateColumnChart(sel.value);

    processComparison();
    updateColumnChart(cols[0]);
    renderTablesPreview();
}

function processComparison() {
    if (uploadedFiles.length < 2) return;
    
    globalDiffs = [];
    globalEquals = [];
    const t1 = uploadedFiles[0].data;
    const t2 = uploadedFiles[1].data;
    const keys = Object.keys(t1[0] || {});

    t1.forEach((row, i) => {
        const row2 = t2[i] || {};
        let diffObj = { "_Linha": i + 1 };
        let hasDiff = false;

        keys.forEach(k => {
            if (row[k] !== row2[k]) {
                hasDiff = true;
                diffObj[k] = `${row[k] || 'Ø'} ⮕ ${row2[k] || 'Ø'}`;
            } else {
                diffObj[k] = row[k];
            }
        });

        if (hasDiff) globalDiffs.push(diffObj);
        else globalEquals.push(diffObj);
    });

    renderDiffUI();
}

function renderDiffUI() {
    const area = document.getElementById('comparisonResult');
    area.classList.remove('hidden');
    document.getElementById('diffCounter').innerText = `${globalDiffs.length} Divergências`;
    document.getElementById('btnExport').classList.remove('hidden');

    const header = document.getElementById('diffHeader');
    const body = document.getElementById('diffBody');
    const keys = Object.keys(uploadedFiles[0].data[0] || {});

    header.innerHTML = `<tr><th>Linha</th>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    body.innerHTML = globalDiffs.slice(0, 50).map(d => `
        <tr><td>${d._Linha}</td>${keys.map(k => {
            const isDiff = String(d[k]).includes('⮕');
            return `<td class="${isDiff ? 'diff-cell' : ''}">${d[k]}</td>`;
        }).join('')}</tr>`).join('');

    renderPieChart(globalDiffs.length, globalEquals.length);
}

function renderPieChart(diffs, equals) {
    const ctx = document.getElementById('chartDiff').getContext('2d');
    if(window.pChart) window.pChart.destroy();
    
    window.pChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [`Divergências: ${diffs}`, `Iguais: ${equals}`],
            datasets: [{ data: [diffs, equals], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }]
        },
        options: {
            cutout: '75%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#64748b', font: { size: 11 } } }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw: (chart) => {
                const { ctx } = chart;
                const x = chart.getDatasetMeta(0).data[0].x;
                const y = chart.getDatasetMeta(0).data[0].y;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#f59e0b';
                ctx.font = 'bold 32px sans-serif';
                ctx.fillText(diffs, x, y - 5);
                ctx.font = '10px sans-serif';
                ctx.fillStyle = '#64748b';
                ctx.fillText('CONFLITOS', x, y + 22);
                ctx.restore();
            }
        }]
    });
}

function updateColumnChart(col) {
    const counts = {};
    uploadedFiles[0].data.forEach(r => { counts[r[col]] = (counts[r[col]] || 0) + 1; });
    
    const ctx = document.getElementById('chartColumns').getContext('2d');
    if(window.cChart) window.cChart.destroy();
    window.cChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(counts).slice(0, 10),
            datasets: [{ label: 'Qtd', data: Object.values(counts).slice(0, 10), backgroundColor: '#3b82f6', borderRadius: 4 }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, grid: { color: '#1e293b' } }, x: { grid: { display: false } } }
        }
    });
}

document.getElementById('btnExport').onclick = () => {
    const filter = document.getElementById('filterStatus').value;
    let toExport = filter === 'diff' ? globalDiffs : (filter === 'equal' ? globalEquals : [...globalDiffs, ...globalEquals]);
    
    const ws = XLSX.utils.json_to_sheet(toExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultado");
    XLSX.writeFile(wb, `Relatorio_${filter}.xlsx`);
};

function renderTablesPreview() {
    const cont = document.getElementById('tablesContainer');
    cont.innerHTML = uploadedFiles.map((f, i) => `
        <div class="card p-4">
            <h4 class="text-[10px] font-bold text-slate-500 uppercase mb-2">Tabela ${i+1}: ${f.name}</h4>
            <div class="table-wrapper"><table>
                <tbody>${f.data.slice(0, 5).map(r => `<tr>${Object.values(r).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div>
        </div>`).join('');
    document.getElementById('fileCount').innerText = `${uploadedFiles.length}/5 Arquivos`;
}

document.getElementById('btnClear').onclick = () => location.reload();