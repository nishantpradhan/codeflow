import neo4j from 'neo4j-driver'
import dotenv from 'dotenv'
import chalk from 'chalk'

dotenv.config()

const NEO4J_URL = process.env.NEO4J_URL || 'bolt://localhost:7687'
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password'

async function clearNeo4j() {
  const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD))
  const session = driver.session()

  try {
    console.log(chalk.blue('Clearing Neo4j database...'))
    await session.run('MATCH (n) DETACH DELETE n')
    console.log(chalk.green('✓ Neo4j database cleared'))
  } catch (error) {
    console.error(chalk.red('✗ Failed to clear Neo4j database:'), error)
    process.exit(1)
  } finally {
    await session.close()
    await driver.close()
  }
}

clearNeo4j()
