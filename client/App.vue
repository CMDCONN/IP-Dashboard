<template>
  <div class="min-h-screen bg-gray-900">
    <header class="bg-gray-800 border-b border-gray-700">
      <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
            </svg>
          </div>
          <h1 class="text-2xl font-bold">IP Dashboard</h1>
        </div>
        <button 
          @click="showAddModal = true"
          class="bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
          </svg>
          Add IP
        </button>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-8">
      <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-8">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          Auto IP Search & Bulk Scan
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-300 mb-1">IP Range (CIDR or Start-End)</label>
            <input
              v-model="scanConfig.range"
              type="text"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
              placeholder="192.168.1.0/24"
            >
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Port Range</label>
            <input
              v-model="scanConfig.portRange"
              type="text"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
              placeholder="1-1000"
            >
          </div>
          <div class="flex items-end">
            <button
              @click="startBulkScan"
              :disabled="isScanning"
              class="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <svg v-if="!isScanning" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
              <svg v-else class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              {{ isScanning ? 'Scanning...' : 'Start Bulk Scan' }}
            </button>
          </div>
        </div>
        <div v-if="scanProgress" class="mt-4">
          <div class="flex items-center justify-between text-sm text-gray-400 mb-2">
            <span>
              <span v-if="scanProgress.phase === 'pinging'">
                {{ scanProgress.current }}/{{ scanProgress.total }} IPs pinged
              </span>
              <span v-else-if="scanProgress.phase === 'port-scanning'">
                Scanning ports: {{ scanProgress.portScanCurrent }}/{{ scanProgress.portScanTotal }} ({{ scanProgress.currentIP }})
              </span>
              <span v-else>
                Scan complete!
              </span>
            </span>
            <span>{{ scanProgress.found }} devices found</span>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-2">
            <div 
              class="bg-primary-500 h-2 rounded-full transition-all duration-300"
              :style="{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }"
            ></div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-primary-500/20 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
            </div>
            <div>
              <p class="text-gray-400 text-sm">Total IPs</p>
              <p class="text-3xl font-bold">{{ ips.length }}</p>
            </div>
          </div>
        </div>
        <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div>
              <p class="text-gray-400 text-sm">Online</p>
              <p class="text-3xl font-bold text-green-400">{{ onlineCount }}</p>
            </div>
          </div>
        </div>
        <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div>
              <p class="text-gray-400 text-sm">Offline</p>
              <p class="text-3xl font-bold text-red-400">{{ offlineCount }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="grid gap-4">
        <div v-for="ip in ips" :key="ip.id" class="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-colors">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
              <div class="w-3 h-3 rounded-full" :class="statusColor(ip.last_status)"></div>
              <div>
                <div class="flex items-center gap-3">
                  <h3 class="text-xl font-semibold">{{ ip.name || ip.ip }}</h3>
                  <span v-if="ip.is_watching" class="bg-primary-500/20 text-primary-400 text-xs px-2 py-1 rounded-full">Watching</span>
                </div>
                <p class="text-gray-400">{{ ip.ip }}</p>
                <p v-if="ip.description" class="text-gray-500 text-sm mt-1">{{ ip.description }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="pingIP(ip.id)"
                :disabled="isPinging[ip.id]"
                class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                title="Ping now"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
              </button>
              <button
                @click="openEditModal(ip)"
                class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                title="Edit"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
              </button>
              <button
                @click="deleteIP(ip.id)"
                class="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="mt-4 flex items-center gap-6 text-sm text-gray-400">
            <span>Last check: {{ ip.last_check ? formatDate(ip.last_check) : 'Never' }}</span>
            <span>Interval: {{ ip.watch_interval }}s</span>
          </div>
        </div>
      </div>
    </main>

    <div v-if="showAddModal || showEditModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 border border-gray-700">
        <h2 class="text-xl font-bold mb-6">{{ showEditModal ? 'Edit IP' : 'Add IP' }}</h2>
        <form @submit.prevent="saveIP">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">IP Address</label>
              <input
                v-model="formData.ip"
                type="text"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                placeholder="192.168.1.1"
                required
              >
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Name (optional)</label>
              <input
                v-model="formData.name"
                type="text"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
                placeholder="Router"
              >
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Description (optional)</label>
              <textarea
                v-model="formData.description"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500 resize-none"
                rows="3"
                placeholder="Main office router"
              ></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Watch Interval (seconds)</label>
              <input
                v-model.number="formData.watch_interval"
                type="number"
                min="10"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
              >
            </div>
            <div class="flex items-center gap-3">
              <input
                v-model="formData.is_watching"
                type="checkbox"
                id="is_watching"
                class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-primary-500 focus:ring-primary-500"
              >
              <label for="is_watching" class="text-sm text-gray-300">Start watching immediately</label>
            </div>
          </div>
          <div class="flex gap-3 mt-6">
            <button
              type="button"
              @click="closeModals"
              class="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="flex-1 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 transition-colors font-medium"
            >
              {{ showEditModal ? 'Save' : 'Add' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const ips = ref([])
const showAddModal = ref(false)
const showEditModal = ref(false)
const editingId = ref(null)
const isPinging = ref({})
const isScanning = ref(false)
const scanProgress = ref(null)

const formData = ref({
  ip: '',
  name: '',
  description: '',
  watch_interval: 60,
  is_watching: true
})

const scanConfig = ref({
  range: '192.168.1.0/24',
  portRange: '1-1000'
})

const onlineCount = computed(() => ips.value.filter(ip => ip.last_status === 'up').length)
const offlineCount = computed(() => ips.value.filter(ip => ip.last_status === 'down').length)

async function fetchIPs() {
  const res = await fetch('/api/ips')
  ips.value = await res.json()
}

async function startBulkScan() {
  isScanning.value = true
  scanProgress.value = null
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        range: scanConfig.value.range,
        portRange: scanConfig.value.portRange
      })
    })
    
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(line => line.trim())
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          scanProgress.value = data
        } catch (e) {}
      }
    }
    
    fetchIPs()
  } finally {
    isScanning.value = false
  }
}

async function saveIP() {
  if (showEditModal.value) {
    const res = await fetch(`/api/ips/${editingId.value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData.value)
    })
    await res.json()
  } else {
    const res = await fetch('/api/ips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData.value)
    })
    await res.json()
  }
  closeModals()
  fetchIPs()
}

function openEditModal(ip) {
  editingId.value = ip.id
  formData.value = {
    ip: ip.ip,
    name: ip.name,
    description: ip.description,
    watch_interval: ip.watch_interval,
    is_watching: !!ip.is_watching
  }
  showEditModal.value = true
}

function closeModals() {
  showAddModal.value = false
  showEditModal.value = false
  editingId.value = null
  formData.value = {
    ip: '',
    name: '',
    description: '',
    watch_interval: 60,
    is_watching: true
  }
}

async function deleteIP(id) {
  if (confirm('Are you sure you want to delete this IP?')) {
    await fetch(`/api/ips/${id}`, { method: 'DELETE' })
    fetchIPs()
  }
}

async function pingIP(id) {
  isPinging.value[id] = true
  try {
    const res = await fetch(`/api/ips/${id}/ping`, { method: 'POST' })
    await res.json()
    fetchIPs()
  } finally {
    isPinging.value[id] = false
  }
}

function statusColor(status) {
  switch (status) {
    case 'up': return 'bg-green-500'
    case 'down': return 'bg-red-500'
    default: return 'bg-gray-500'
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleString()
}

onMounted(() => {
  fetchIPs()
  setInterval(fetchIPs, 5000)
})
</script>
