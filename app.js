const express = require('express');
const redis = require('redis');
const path = require('path');  // For potential future use (e.g., custom sendFile)
const app = express();
const port = 3000;

console.log('Test sync');  // Your watch test log

// Middleware
app.use(express.json());  // Parse JSON bodies

// CORS for frontend fetch (dev-only; restrict origins in prod)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Serve static files (frontend at /, e.g., public/index.html)
app.use(express.static('public'));

// Redis client
const client = redis.createClient({
  socket: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
});
client.connect().catch(console.error);

// Helper: Get todo index by ID
async function getTodoIndex(id) {
  const todos = await client.lRange('todos', 0, -1);
  return todos.findIndex(todo => JSON.parse(todo).id === parseInt(id));
}

// API Sub-Router (All routes prefixed with /api)
const apiRouter = express.Router();

// Welcome at /api/
apiRouter.get('/', (req, res) => {
  res.json({ 
    message: 'WSL + Watch = Unstoppable 🔥',
    endpoints: [
      'GET /api/todos',
      'POST /api/todos',
      'PUT /api/todos/:id',
      'PATCH /api/todos/:id/toggle',
      'DELETE /api/todos/:id'
    ] 
  });
});

// GET /api/todos
apiRouter.get('/todos', async (req, res) => {
  try {
    const todos = await client.lRange('todos', 0, -1);
    res.json({ count: todos.length, items: todos.map(todo => JSON.parse(todo)) });
  } catch (err) {
    console.error('GET /todos error:', err);  // Log for debugging
    res.status(500).json({ error: err.message });
  }
});

// POST /api/todos
apiRouter.post('/todos', async (req, res) => {
  try {
    if (!req.body.text || typeof req.body.text !== 'string' || req.body.text.trim().length < 1) {
      return res.status(400).json({ error: 'Todo text is required and must be non-empty.' });
    }
    const todo = { id: Date.now(), text: req.body.text.trim(), done: false };
    await client.rPush('todos', JSON.stringify(todo));
    res.status(201).json(todo);
  } catch (err) {
    console.error('POST /todos error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/todos/:id
apiRouter.put('/todos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
    
    const index = await getTodoIndex(id);
    if (index === -1) return res.status(404).json({ error: 'Todo not found.' });
    
    if (!req.body.text || typeof req.body.text !== 'string' || req.body.text.trim().length < 1) {
      return res.status(400).json({ error: 'Todo text is required and must be non-empty.' });
    }
    
    const todos = await client.lRange('todos', 0, -1);
    const updatedTodo = { ...JSON.parse(todos[index]), text: req.body.text.trim() };
    todos[index] = JSON.stringify(updatedTodo);
    await client.del('todos');
    for (const todoStr of todos) await client.rPush('todos', todoStr);
    
    res.json(updatedTodo);
  } catch (err) {
    console.error('PUT /todos/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/todos/:id/toggle
apiRouter.patch('/todos/:id/toggle', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
    
    const index = await getTodoIndex(id);
    if (index === -1) return res.status(404).json({ error: 'Todo not found.' });
    
    const todos = await client.lRange('todos', 0, -1);
    const currentTodo = JSON.parse(todos[index]);
    const updatedTodo = { ...currentTodo, done: !currentTodo.done };
    todos[index] = JSON.stringify(updatedTodo);
    await client.del('todos');
    for (const todoStr of todos) await client.rPush('todos', todoStr);
    
    res.json(updatedTodo);
  } catch (err) {
    console.error('PATCH /todos/:id/toggle error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/todos/:id (Optimized: Single fetch)
apiRouter.delete('/todos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
    
    const todos = await client.lRange('todos', 0, -1);  // Single fetch
    const index = todos.findIndex(todo => JSON.parse(todo).id === id);  // Inline find
    if (index === -1) return res.status(404).json({ error: 'Todo not found.' });
    
    const todoToRemove = todos[index];
    await client.lRem('todos', 1, todoToRemove);  // Remove by value
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /todos/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mount the API router
app.use('/api', apiRouter);

app.listen(port, () => {
  console.log(`Todo API running on http://localhost:${port}`);
  console.log(`Frontend at http://localhost:${port}/`);
  console.log(`API docs at http://localhost:${port}/api/`);
});