let storage = [];
let auditedData = [];
let manualCorrections = 0;
let charts = {};

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('btn-' + id.split('-')[1]).classList.add('active');
    Object.values(charts).forEach(c => c.resize());
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length < 2) return alert("Suba 2 arquivos para auditoria.");
    
    storage = [];
    document.getElementById('diag-files').innerHTML = '';
    
    for (let f of files) {
        const data = await parseFile(f);
        storage.push({ name: f.name, rows: data });
        renderDiagCard(f.name, data.length);
    }
    processAudit();
});

async function parseFile(file) {
    return new Promise(resolve => {
        if (file.name.endsWith('.csv')) {
            Papa.parse(file, { header: true, skipEmptyLines: true, delimiter: ";", complete: r => resolve(r.data) });
        } else {
            const reader = new FileReader();
            reader.onload = e => {
                const wb = XLSX.read(e.target.result, { type: 'binary' });
                resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
            };
            reader.readAsBinaryString(file);
        }
    });
}

function processAudit() {
    const base = storage[0].rows;
    const comp = storage[1].rows;
    
    const findCol = (row, kws) => Object.keys(row).find(k => kws.some(kw => k.toUpperCase().includes(kw)));
    
    const cIdB = findCol(base[0], ["CPF", "NOME", "ALUNO"]);
    const cStB = findCol(base[0], ["SITUACAO", "STATUS"]);
    const cIdC = findCol(comp[0], ["ALUNO", "NOME", "CPF"]);
    const cStC = findCol(comp[0], ["STATUS", "SITUACAO"]);
    const cMun = findCol(base[0], ["MUNICIPIO", "CIDADE"]);

    auditedData = base.map(row => {
        const idB = String(row[cIdB] || "").toUpperCase().trim();
        const match = comp.find(r => String(r[cIdC] || "").toUpperCase().includes(idB.split(' ')[0]) && idB.length > 3);
        
        let res = "ausente";
        if (match) {
            const stB = String(row[cStB] || "").toUpperCase();
            const stC = String(match[cStC] || "").toUpperCase();
            res = (stB.includes(stC) || stC.includes(stB)) ? "relacionado" : "divergente";
        }
        return { ...row, _audit: res, _municipio: row[cMun] || "Outros" };
    });

    updateDash();
    renderAcertos(cIdB);
}

function renderAcertos(col) {
    const container = document.getElementById('acerto-container');
    const pendentes = auditedData.filter(r => r._audit === 'ausente').slice(0, 5);
    container.innerHTML = pendentes.map(r => `
        <div class="bg-white/5 p-6 rounded-2xl flex justify-between items-center border border-white/5">
            <div>
                <p class="text-[10px] text-orange-500 font-bold uppercase mb-1">Divergência de Identidade</p>
                <h4 class="text-white font-bold">${r[col]}</h4>
            </div>
            <button onclick="confirmarMatch(this)" class="bg-blue-600/10 text-blue-500 px-6 py-2 rounded-xl text-[10px] font-bold hover:bg-blue-600 hover:text-white transition-all">CONFIRMAR VÍNCULO</button>
        </div>
    `).join('');
    document.getElementById('acerto-count').innerText = pendentes.length + " Pendências";
}

function updateDash() {
    const total = auditedData.length;
    const div = auditedData.filter(r => r._audit === 'divergente').length;
    const rel = auditedData.filter(r => r._audit === 'relacionado').length;

    document.getElementById('kpi-total').innerText = total;
    document.getElementById('kpi-conf').innerText = ((rel/total)*100).toFixed(1) + "%";
    document.getElementById('kpi-div').innerText = div;
    
    drawChart('chartStatus', 'doughnut', [div, rel, total-(div+rel)], ['#f59e0b', '#10b981', '#334155'], ['Divergente', 'Relacionado', 'Ausente']);
    
    const cityMap = auditedData.reduce((a, r) => { a[r._municipio] = (a[r._municipio] || 0) + 1; return a; }, {});
    const topCities = Object.entries(cityMap).sort((a,b) => b[1] - a[1]).slice(0, 10);
    drawChart('chartCities', 'bar', topCities.map(c => c[1]), '#3b82f6', topCities.map(c => c[0]), 'y');

    renderParecer(total, div, rel);
}

function renderParecer(t, d, r) {
    document.getElementById('rel-content').innerHTML = `
        <h2 class="text-3xl font-extrabold text-white text-center">PARECER TÉCNICO DE AUDITORIA</h2>
        <div class="space-y-6 text-slate-400 leading-relaxed text-lg">
            <p>O sistema processou <strong>${t} registros</strong>. Identificamos uma conformidade de <strong>${((r/t)*100).toFixed(1)}%</strong> entre as bases.</p>
            <div class="bg-orange-500/10 border-l-4 border-orange-500 p-6 rounded-xl">
                <p class="text-orange-400 font-bold">Atenção: Foram detectadas ${d} divergências de status que impactam o faturamento.</p>
            </div>
            <p><strong>Recomendação:</strong> Saneamento imediato das unidades com maior volume de divergências conforme detalhado no PDF.</p>
        </div>
    `;
}

function drawChart(id, type, data, color, labels, axis = 'x') {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: type,
        data: { labels: labels, datasets: [{ data: data, backgroundColor: color, borderRadius: 8 }] },
        options: { indexAxis: axis, maintainAspectRatio: false, plugins: { legend: { display: type === 'doughnut' } } }
    });
}
