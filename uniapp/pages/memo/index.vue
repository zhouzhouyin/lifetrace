<template>
  <view class="wrap">
    <view class="card">
      <view class="title">随手记</view>
      <textarea class="input" v-model="text" placeholder="写点什么…（将自动保存）" @blur="save" />
      <view class="row">
        <input class="tag" v-model="tag" placeholder="#标签（如 童年/少年）" />
        <button class="btn-primary" @tap="save">保存</button>
      </view>
    </view>
    <view class="list">
      <view class="memo" v-for="m in memos" :key="m._id || m.ts">
        <view class="time">{{ fmt(m.createdAt || m.ts) }}</view>
        <view class="content">{{ m.text }}</view>
        <view class="tags">{{ (m.tags||[]).join('、') }}</view>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api.js'
export default {
  data(){
    return { text: '', tag: '', memos: [], loading:false }
  },
  onShow(){ this.fetch() },
  methods: {
    async fetch(){
      try {
        const data = await api.listMemos()
        this.memos = Array.isArray(data)? data : (data&&data.items)||[]
      } catch(e){
        // 本地兜底
        const local = uni.getStorageSync('memos') || []
        this.memos = local
      }
    },
    fmt(ts){
      try { return new Date(ts).toLocaleString() } catch(e){ return '' }
    },
    async save(){
      const payload = { text: this.text, tags: this.tag? [this.tag] : [] }
      if (!payload.text) { return }
      try {
        const saved = await api.createMemo(payload)
        this.text = ''
        this.tag = ''
        await this.fetch()
      } catch(e){
        // 本地保存
        const local = uni.getStorageSync('memos') || []
        local.unshift({ text: payload.text, tags: payload.tags, ts: Date.now() })
        uni.setStorageSync('memos', local)
        this.text = ''
        this.tag = ''
        this.memos = local
      }
    }
  }
}
</script>

<style scoped>
.wrap { padding: 24rpx; }
.title { font-size: 36rpx; font-weight: 700; margin-bottom: 12rpx; }
.input { background: #fff; border:1px solid #e5e7eb; border-radius: 12rpx; min-height: 160rpx; padding: 16rpx; }
.row { display:flex; gap: 12rpx; margin-top: 12rpx; }
.tag { flex:1; background:#f3f4f6; border-radius:12rpx; padding: 16rpx; }
.btn-primary { background:#4A90E2; color:#fff; border:none; border-radius:12rpx; padding: 14rpx 22rpx; }
.list { margin-top: 20rpx; display:flex; flex-direction:column; gap: 12rpx; }
.memo { background:#fff; border:1px solid #e5e7eb; border-radius:12rpx; padding: 16rpx; }
.time { color:#6b7280; font-size: 22rpx; margin-bottom: 6rpx; }
.content { color:#111827; margin-bottom: 6rpx; }
.tags { color:#374151; font-size: 24rpx; }
</style>

