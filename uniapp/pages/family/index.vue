<template>
  <view class="wrap">
    <view class="card">
      <view class="title">家族档案</view>
      <view class="subtitle">家族随手记共享（示例）</view>
      <view class="empty" v-if="!items.length">还没有家族共享内容</view>
      <view class="memo" v-for="it in items" :key="it._id || it.ts">
        <view class="from">{{ it.from || '家人' }}</view>
        <view class="content">{{ it.text }}</view>
      </view>
    </view>
  </view>
</template>

<script>
export default { data(){ return { items: [] } } }
</script>

<style scoped>
.wrap { padding: 24rpx; }
.title { font-size: 36rpx; font-weight: 700; margin-bottom: 8rpx; }
.subtitle { font-size: 26rpx; color: #374151; margin-bottom: 12rpx; }
.empty { color:#6b7280; }
.memo { background:#fff; border:1px solid #e5e7eb; border-radius:12rpx; padding: 16rpx; margin-bottom: 12rpx; }
.from { color:#6b7280; font-size: 22rpx; margin-bottom: 6rpx; }
.content { color:#111827; }
</style>

