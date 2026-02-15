// server.js (Backend Node.js/Express) - CORRIGIDO para dados em memória

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // CRÍTICO: Para permitir que o Frontend estático chame a API
const app = express();
const PORT = 3000;

// Configuração do CORS (Permite que o navegador acesse esta API)
app.use(cors({ origin: '*' })); 
app.use(bodyParser.json());

// --- DADOS SIMULADOS EM MEMÓRIA (MOCK DE DB) ---
const MOCK_LEADS_DB = [
    // Dados para o client_beta_1
    { client_id: 'client_beta_1', deal_name: "Projeto Fênix (Upgrade)", lead_score: 95, lead_category: "HOT", motivos_chave: "Decisor Engajado, Alto Valor", ultima_atualizacao: "2025-10-15 14:00" },
    { client_id: 'client_beta_1', deal_name: "Nova Conta - Segmento A", lead_score: 88, lead_category: "HOT", motivos_chave: "Fit Perfeito, Atividade Alta", ultima_atualizacao: "2025-10-15 11:30" },
    { client_id: 'client_beta_1', deal_name: "Lead da Conferência X", lead_score: 62, lead_category: "WARM", motivos_chave: "Valor Médio, Inatividade (5 dias)", ultima_atualizacao: "2025-10-10 09:00" },
    { client_id: 'client_beta_1', deal_name: "Conta Legado - Baixa Atividade", lead_score: 30, lead_category: "COLD", motivos_chave: "Baixo Engajamento, Risco de Perda", ultima_atualizacao: "2025-09-01 16:45" },
    // Outros dados...
];

const MOCK_ROI = {
    conversao_hot: "19.2%",
    conversao_cold: "4.5%",
    uplift: "326%"
};

// --- Middleware de Autenticação (Simulado) ---
const authenticate = (req, res, next) => {
    // Para simplificar o teste, vamos apenas garantir que um cliente é setado.
    req.user = { id: 1, client_id: 'client_beta_1' }; 
    next();
};

// --- Rota de Leads (Agora sem DB, busca no MOCK_LEADS_DB) ---
app.get('/api/v1/leadsense/prioridade', authenticate, (req, res) => {
    const client_id = req.user.client_id;
    
    // Filtra os leads pelo cliente (simulando a consulta DB)
    const leadsFiltrados = MOCK_LEADS_DB
        .filter(lead => lead.client_id === client_id)
        // Mapeia para o formato final que o Frontend espera
        .map(lead => ({
            nome: lead.deal_name,
            score: lead.lead_score,
            categoria: lead.lead_category,
            motivos: lead.motivos_chave,
            updated_at: lead.ultima_atualizacao
        }));

    res.status(200).json({ leads: leadsFiltrados });
});

// --- Rota de Métricas de ROI (Busca no MOCK_ROI) ---
app.get('/api/v1/leadsense/roi', authenticate, (req, res) => {
    res.status(200).json(MOCK_ROI);
});

app.listen(PORT, () => {
    console.log(`Backend LeadSense rodando na porta ${PORT}. Acesse: http://localhost:${PORT}`);
    console.log("------------------------------------------------------------------");
    console.log("LEMBRETE: O Frontend (index.html) DEVE ser aberto em paralelo.");
});
