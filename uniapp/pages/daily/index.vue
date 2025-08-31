<template>
  <view class="wrap">
    <view class="card">
      <view class="title">每日回首</view>
      <view class="stage">阶段：{{ stageText }} ｜ 进度：{{ progress }}</view>
      <view class="ai">{{ feedback }}</view>
      <view class="q">{{ question }}</view>
      <textarea class="a" v-model="answer" placeholder="写下你的回答…" />
      <view class="row">
        <button class="btn-primary" @tap="submit">继续回首</button>
        <button class="btn-tertiary" @tap="change">换一个问题</button>
      </view>
      <view class="row">
        <button class="btn-tertiary" @tap="paste">粘贴到记录</button>
        <button class="btn-tertiary" @tap="saveMemo">保存到随手记</button>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '../../utils/api.js'
export default {
  data(){
    return { stageText: '童年', progress: '0/10', question: '回想童年，哪一刻让你忽然觉得“自己长大了”？', feedback: '写得很好，我们慢慢来。', answer: '' }
  },
  async onShow(){ await this.fetch() },
  methods: {
    async fetch(){
      try {
        const s = await api.getDailySession()
        this.stageText = s.stageText || s.stage || '童年'
        this.progress = s.progress || '0/10'
        this.question = s.question || this.question
        this.feedback = s.feedback || this.feedback
      } catch(e) {}
    },
    async submit(){
      const content = this.answer
      if (!content) { uni.showToast({ title:'先写一点点吧', icon:'none' }); return }
      try {
        await api.answerDaily({ answer: content })
        this.answer = ''
        await this.fetch()
      } catch(e){ uni.showToast({ title:'保存失败', icon:'none' }) }
    },
    async change(){
      try { await api.nextDaily(); this.answer=''; await this.fetch() } catch(e) {}
    },
    paste(){
      // 传至记录此生（临时：通过全局事件/重启页面）
      const text = `【每日回首】\n${this.feedback}\n问：${this.question}\n答：${this.answer || '（此处留空）'}`
      uni.navigateTo({ url: '/pages/create/index' })
      uni.setStorageSync('paste_from_daily', text)
    },
    async saveMemo(){
      try {
        await api.createMemo({ text: `每日回首\n问：${this.question}\n答：${this.answer}`, tags: ['每日回首', this.stageText] })
        uni.showToast({ title:'已保存到随手记', icon:'success' })
      } catch(e){ uni.showToast({ title:'保存失败', icon:'none' }) }
    }
  }
}
</script>

<style scoped>
.wrap { padding: 24rpx; }
.title { font-size: 36rpx; font-weight: 700; margin-bottom: 8rpx; }
.stage { color:#374151; font-size: 24rpx; margin-bottom: 8rpx; }
.ai { color:#374151; font-size: 24rpx; margin-bottom: 6rpx; }
.q { font-weight: 700; color:#111827; margin-bottom: 8rpx; }
.a { background:#fff; border:1px solid #e5e7eb; border-radius: 12rpx; padding: 16rpx; min-height: 160rpx; }
.row { display:flex; gap: 12rpx; margin-top: 12rpx; }
.btn-primary { background:#4A90E2; color:#fff; border:none; border-radius: 12rpx; padding: 14rpx 22rpx; }
.btn-tertiary { color:#4A90E2; border:1px solid #4A90E2; background:transparent; border-radius:12rpx; padding: 14rpx 22rpx; }
</style>

