require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = 3000;

const FRESHDESK_DOMAIN = process.env.FRESHDESK_DOMAIN;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY;
const API_ACCESS_KEY = process.env.API_ACCESS_KEY;

// API Key Middleware
app.use((req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    if (providedKey !== API_ACCESS_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }
    next();
});

// /ticket/:id returns full ticket + agent names + convos
app.get('/ticket/:id', async (req, res) => {
    const ticketId = req.params.id;

    try {
        const ticketResponse = await axios.get(`https://${FRESHDESK_DOMAIN}/api/v2/tickets/${ticketId}`, {
            auth: { username: FRESHDESK_API_KEY, password: 'X' }
        });
        const ticket = ticketResponse.data;

        const convoResponse = await axios.get(`https://${FRESHDESK_DOMAIN}/api/v2/tickets/${ticketId}/conversations`, {
            auth: { username: FRESHDESK_API_KEY, password: 'X' }
        });

        const userCache = {};

        const getUserName = async (userId) => {
            if (userCache[userId]) return userCache[userId];
            const userRes = await axios.get(`https://${FRESHDESK_DOMAIN}/api/v2/contacts/${userId}`, {
                auth: { username: FRESHDESK_API_KEY, password: 'X' }
            });
            const name = userRes.data.name;
            userCache[userId] = name;
            return name;
        };

        const formattedConvos = await Promise.all(
            convoResponse.data.map(async (entry) => ({
                body: entry.body_text,
                private: entry.private,
                from: await getUserName(entry.user_id),
                created_at: entry.created_at
            }))
        );

        res.json({
            subject: ticket.subject,
            description: ticket.description_text,
            requester: await getUserName(ticket.requester_id),
            status: ticket.status,
            priority: ticket.priority,
            conversations: formattedConvos
        });

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to fetch ticket or conversations' });
    }
});

// /summary/:id returns human-readable summary
app.get('/summary/:id', async (req, res) => {
    try {
        const ticketRes = await axios.get(`http://localhost:${port}/ticket/${req.params.id}`, {
            headers: { 'x-api-key': API_ACCESS_KEY }
        });

        const data = ticketRes.data;

        const summary = `
Ticket Summary:
- Subject: ${data.subject || '(No subject)'}
- Requester: ${data.requester}
- Priority: ${data.priority}
- Status: ${data.status}
- Issue: ${data.description.trim()}

Conversations:
${data.conversations.map(c => `- [${c.private ? 'PRIVATE' : 'PUBLIC'}] ${c.from}: ${c.body.slice(0, 120)}...`).join('\n')}
        `;

        res.send(`<pre>${summary}</pre>`);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Could not generate summary.");
    }
});

app.listen(port, () => {
    console.log(`✅ API server running at http://localhost:${port}`);
});
