import { defineConfig } from '@prisma/config'

export default defineConfig({
  earlyAccess: true,
  migrate: {
    databaseUrl: 'file:./dev.db'
  }
})
