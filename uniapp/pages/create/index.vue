<template>
  <view class="wrap">
    <view class="card">
      <view class="title">记录此生</view>
      <view class="subtitle">基于关系视角的情感访谈（简化版）</view>
      <view class="field">
        <view class="picker">模式：{{ modeText }}</view>
      </view>

      <view class="qa">
        <view class="ai">{{ warm }}</view>
        <view class="q">{{ question }}</view>
        <textarea class="a" v-model="answer" placeholder="在这里回答..." />
        <view class="actions">
          <button class="btn-primary" @tap="submit">发送</button>
          <button class="btn-tertiary" @tap="next">换一个</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api.js'
export default {
  data() {
    return {
      modeText: '为自己写',
      relation: '',
      question: '我们从童年开始吧，最让你会心一笑的画面是什么？',
      warm: '谢谢你愿意开始记录，这是一段温柔的整理之旅。',
      answer: ''
    }
  },
  onShow(){
    try {
      const mode = uni.getStorageSync('record_mode') || 'self'
      const rel = uni.getStorageSync('record_relation') || ''
      this.modeText = mode === 'self' ? '为自己写' : '为他人写'
      this.relation = rel
    } catch(e) {}
  },
  methods: {
    async submit() {
      if (!this.answer) { uni.showToast({ title: '先写一点点吧', icon: 'none' }); return }
      try {
        // 简化：存入随手记作为草稿
        await api.createMemo({
          text: this.composeQA(),
          tags: ['记录此生'],
          visibility: 'private'
        })
        uni.showToast({ title: '已保存', icon: 'success' })
        this.answer = ''
      } catch (e) {
        uni.showToast({ title: '保存失败', icon: 'none' })
      }
    },
    async next() {
      // 直接请求后端 daily next 以获得新的风格问题（临时复用）
      try {
        const data = await api.nextDaily()
        if (data && data.question) {
          this.warm = data.feedback || '你写得很好，我们继续。'
          this.question = data.question
          this.answer = ''
        }
      } catch (e) {
        this.question = '回想少年时期，谁的一个举动让你改变了自己？'
        this.warm = '你的经历值得被温柔地记录。'
        this.answer = ''
      }
    },
    composeQA() {
      const mode = this.modeText
      const isOther = mode === '为他人写'
      const prefix = isOther && this.relation ? `关系：${this.relation}。` : ''
      return `${prefix}${this.warm}\n问：${this.question}\n答：${this.answer}`
    }
  }
}
</script>

<style scoped>
.wrap { padding: 24rpx; }
.title { font-size: 36rpx; font-weight: 700; margin-bottom: 8rpx; }
.subtitle { font-size: 26rpx; color: #374151; margin-bottom: 16rpx; }
.field { margin-bottom: 12rpx; }
.picker { background: #f3f4f6; padding: 18rpx; border-radius: 12rpx; color:#111827; }
.input { background: #f3f4f6; border-radius: 12rpx; padding: 18rpx; font-size: 28rpx; }
.qa { margin-top: 12rpx; }
.ai { color:#374151; font-size: 24rpx; margin-bottom: 6rpx; }
.q { font-weight: 700; color:#111827; margin-bottom: 8rpx; }
.a { background:#fff; border:1px solid #e5e7eb; border-radius: 12rpx; padding: 16rpx; min-height: 160rpx; }
.actions { display:flex; gap: 12rpx; margin-top: 12rpx; }
.btn-primary { background:#4A90E2; color:#fff; border:none; border-radius: 12rpx; padding: 14rpx 22rpx; }
.btn-tertiary { color:#4A90E2; border:1px solid #4A90E2; background:transparent; border-radius:12rpx; padding: 14rpx 22rpx; }
</style>

