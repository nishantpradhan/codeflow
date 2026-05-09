import express, { Express } from 'express'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import chalk from 'chalk'
import { Neo4jDB } from '../storage/neo4j'
import { SQLiteDB } from '../storage/sqlite'
import { QueryEngine } from '../query/queryEngine'
import { WSServer } from './wsServer'
import { createGraphRouter } from './graphApi'
import { FileWatcher } from '../cli/watcher'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app: Express = express()
const server = http.createServer(app)

// ============================================================
// Middleware
// ============================================================

app.use(express.json())
app.use(express.static(path.join(__dirname, '../../dist/ui')))

// ============================================================
// Initialization
// ============================================================

async function initializeServer() {
  try {
    // Database connections
    const neo4jUrl = process.env.NEO4J_URL || 'bolt://localhost:7687'
    const neo4jUser = process.env.NEO4J_USER || 'neo4j'
    const neo4jPassword = process.env.NEO4J_PASSWORD || 'password'
    const sqlitePath = process.env.SQLITE_PATH || './data/codeflow.db'

    console.log(chalk.blue('🚀 Initializing Codeflow server...'))

    const neo4j = new Neo4jDB(neo4jUrl, neo4jUser, neo4jPassword)
    const sqlite = new SQLiteDB(sqlitePath)
    const queryEngine = new QueryEngine(neo4j, sqlite)

    console.log(chalk.gray('  Connecting to databases...'))
    // await neo4j.init() // Uncomment when needed
    sqlite.init()

    // WebSocket server
    console.log(chalk.gray('  Setting up WebSocket server...'))
    const wsServer = new WSServer(server, queryEngine)

    // REST API routes
    console.log(chalk.gray('  Registering API routes...'))
    app.use('/api/graph', createGraphRouter(queryEngine))

    // File watcher (optional)
    const projectRoot = process.env.PROJECT_ROOT || process.cwd()
    const watcher = new FileWatcher(projectRoot, neo4j, sqlite, {
      onFileChange: (event, filePath) => {
        wsServer.broadcastFileChange(event, filePath, [filePath])
      }
    })

    // Health check endpoint
    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
      })
    })

    // SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../dist/ui/index.html'))
    })

    // Start server
    const PORT = process.env.PORT || 5173
    server.listen(PORT, () => {
      console.log(
        chalk.green('✓ Server running at') + ' ' + chalk.cyan(`http://localhost:${PORT}`)
      )
      console.log(chalk.green('✓ WebSocket ready at') + ' ' + chalk.cyan(`ws://localhost:${PORT}/ws`))
      console.log(chalk.gray('  Press Ctrl+C to stop\n'))
    })

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n⚠️  Shutting down...'))
      watcher.stop()
      await neo4j.close()
      sqlite.close()
      server.close(() => {
        console.log(chalk.green('✓ Server stopped'))
        process.exit(0)
      })
    })
  } catch (error) {
    console.error(chalk.red('❌ Initialization error:'), (error as Error).message)
    process.exit(1)
  }
}

initializeServer()
