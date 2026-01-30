let storage = [];
let auditedData = [];
let charts = {};

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const map = {'tab-charts': 'btn-charts', 'tab-table': 'btn-table', 'tab-ai': 'btn-ai-tab'};
    document.getElementById(map[id]).classList.add('active');
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    storage = [];
    for (let f of files) {
        const data = await parseFile(f);
        storage.push({ name: f.name, rows: data });
    }
    if (storage.length > 0) {
        processAudit();
        generateAiReport();
    }
});

async function parseFile(file) {
    return new Promise(resolve => {
        if (file.name.endsWith('.csv')) {
            // Auto-detecta delimitador ; ou ,
            Papa.parse(file, { 
                header: true, 
                skipEmptyLines: true, 
                dynamicTyping: true,
                complete: res => resolve(res.data) 
            });
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

// Função de busca inteligente de colunas
function findCol(row, keywords) {
    const keys = Object.keys(row);
    return keys.find(k => keywords.some(kw => k.toUpperCase().includes(kw))) || null;
}

function processAudit() {
    const base = storage[0].rows;
    const comp = storage[1]?.rows || null;
    let dCount = 0;

    // Mapeia colunas dinamicamente
    const colNome = findCol(base[0], ["ALUNO", "NOME", "CLIENTE"]);
    const colStatus = findCol(base[0], ["STATUS", "SITUACAO", "MATRICULA"]);
    const colCidade = findCol(base[0], ["CIDADE", "MUNICIPIO"]);

    auditedData = base.map(row => {
        let isDiff = false;
        if (comp) {
            const valNome = String(row[colNome] || "").trim().toLowerCase();
            const match = comp.find(r => String(r[findCol(comp[0], ["ALUNO", "NOME"])] || "").trim().toLowerCase() === valNome);
            
            if (!match) isDiff = true;
            else {
                const s1 = String(row[colStatus] || "").trim();
                const s2 = String(match[findCol(comp[0], ["STATUS", "SITUACAO"])] || "").trim();
                if (s1 !== s2) isDiff = true;
            }
        }
        if (isDiff) dCount++;
        return { ...row, _isDiff: isDiff };
    });

    updateDashboard(dCount, colStatus, colCidade);
    renderTable();
}

function updateDashboard(diffs, colStatus, colCidade) {
    const total = auditedData.length;
    document.getElementById('kpiRows').innerText = total;
    document.getElementById('kpiDiffs').innerText = diffs;
    document.getElementById('kpiEquals').innerText = total - diffs;

    renderChart('chartStatus', 'doughnut', [diffs, total - diffs], ['#f59e0b', '#10b981'], ['Inconsistentes', 'OK']);
    
    const cityData = auditedData.reduce((acc, r) => { const c = r[colCidade] || "Outros"; acc[c] = (acc[c] || 0) + 1; return acc; }, {});
    const topCities = Object.entries(cityData).sort((a,b) => b[1] - a[1]).slice(0, 5);
    renderChart('chartCities', 'bar', topCities.map(c => c[1]), ['#3b82f6'], topCities.map(c => c[0]));

    const statusData = auditedData.reduce((acc, r) => { const s = r[colStatus] || "Outros"; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
    renderChart('chartStatusPie', 'pie', Object.values(statusData), ['#6366f1', '#ec4899', '#10b981'], Object.keys(statusData));
}

function renderChart(id, type, data, colors, labels) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
        type: type,
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }] },
        options: { plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 9 } } } } }
    });
}

function renderTable() {
    const keys = Object.keys(auditedData[0]).filter(k => !k.startsWith('_'));
    document.getElementById('tableHeader').innerHTML = `<tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    document.getElementById('tableBody').innerHTML = auditedData.slice(0, 200).map(r => `
        <tr class="${r._isDiff ? 'diff-row' : ''}">${keys.map(k => `<td>${r[k] || ''}</td>`).join('')}</tr>
    `).join('');
}

async function generateAiReport() {
    const key = document.getElementById('geminiKey').value;
    const aiTxt = document.getElementById('aiTxt');
    if (!key) return aiTxt.innerHTML = "<b class='text-yellow-500'>Por favor, insira sua API Key no topo para gerar o relatório automático.</b>";

    document.getElementById('aiLoader').classList.remove('hidden');
    aiTxt.innerHTML = "Extraindo informações e gerando parecer...";

    const resumo = auditedData.slice(0, 20).map(r => JSON.stringify(r)).join("\n");
    const prompt = `Aja como um auditor sênior. Extraia automaticamente os dados destes dois arquivos. 
    Divergências: ${auditedData.filter(r => r._isDiff).length}.
    Crie: 1. Parecer das Diferenças. 2. Relação entre os meses. 3. Conclusão estratégica. 
    Se houver erro de colunas, diga como corrigir. Dados: ${resumo}`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        aiTxt.innerHTML = data.candidates[0].content.parts[0].text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b class="text-white">$1</b>');
    } catch (e) {
        aiTxt.innerHTML = "Erro ao processar o relatório da IA.";
    } finally {
        document.getElementById('aiLoader').classList.add('hidden');
    }
}
