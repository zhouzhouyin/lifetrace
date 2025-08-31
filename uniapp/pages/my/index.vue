<template>
  <view class="wrap">
    <view class="card">
      <view class="title">我的</view>
      <view class="subtitle">最近随手记</view>
      <view class="list">
        <view class="memo" v-for="m in memos" :key="m._id || m.ts">
          <view class="time">{{ fmt(m.createdAt || m.ts) }}</view>
          <view class="content">{{ m.text }}</view>
        </view>
      </view>
      <view class="row">
        <button class="btn-tertiary" @tap="go('/pages/memo/index')">去随手记</button>
        <button class="btn-tertiary" @tap="go('/pages/create/index')">去记录此生</button>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api.js'
export default {
  data(){ return { memos: [] } },
  onShow(){ this.fetch() },
  methods: {
    async fetch(){
      try {
        const data = await api.listMemos()
        const list = Array.isArray(data)? data : (data&&data.items)||[]
        this.memos = list.slice(0, 5)
      } catch(e){
        const local = uni.getStorageSync('memos') || []
        this.memos = local.slice(0, 5)
      }
    },
    fmt(ts){ try { return new Date(ts).toLocaleString() } catch(e){ return '' } },
    go(url){ uni.navigateTo({ url }) }
  }
}
</script>

<style scoped>
.wrap { padding: 24rpx; }
.title { font-size: 36rpx; font-weight: 700; margin-bottom: 8rpx; }
.subtitle { font-size: 26rpx; color: #374151; margin-bottom: 12rpx; }
.list { display:flex; flex-direction:column; gap: 12rpx; margin-bottom: 12rpx; }
.memo { background:#fff; border:1px solid #e5e7eb; border-radius:12rpx; padding: 16rpx; }
.time { color:#6b7280; font-size: 22rpx; margin-bottom: 6rpx; }
.content { color:#111827; }
.row { display:flex; gap: 12rpx; }
.btn-tertiary { color:#4A90E2; border:1px solid #4A90E2; background:transparent; border-radius:12rpx; padding: 14rpx 22rpx; }
</style>

