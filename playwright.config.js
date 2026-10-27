import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'./tests',testMatch:'**/*.spec.js',timeout:120000,expect:{timeout:10000},workers:1,use:{channel:'msedge',headless:true,trace:'retain-on-failure'},webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5188 --strictPort',url:'http://127.0.0.1:5188',reuseExistingServer:true}})
