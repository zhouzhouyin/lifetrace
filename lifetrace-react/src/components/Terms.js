import React from 'react';
import { useNavigate } from 'react-router-dom';

const Terms = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="card max-w-3xl mx-auto w-full p-6 bg-white shadow-md rounded-lg">
        <h1 className="text-2xl font-bold mb-6">服务条款</h1>
        
        <p className="text-gray-700 mb-4">
          <strong>更新日期：2025年8月15日</strong><br />
          <strong>生效日期：2025年8月15日</strong>
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-4">引言</h2>
        <p className="text-gray-700 mb-4">
          欢迎您使用【永念】服务！本服务条款（下称“本条款”）是您与【永念】（下称“我们”或“本公司”）之间，就您使用我们的数字与实体服务所订立的协议。您在使用本服务前，请务必仔细阅读、充分理解并接受本条款的全部内容。一旦您点击“同意”或以任何方式使用本服务，即表示您已同意接受本条款的约束。
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-4">一、服务内容</h2>
        <p className="text-gray-700 mb-4">
          我们提供的服务旨在帮助您记录生命、对抗遗忘、传承精神财富。本服务包括但不限于以下内容：
        </p>
        <h3 className="text-lg font-medium mt-4 mb-2">数字服务：</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>传记创建与存储</strong>：您可创建个人传记、家族传记，并上传文字、图片、音频、视频等资料。</li>
          <li><strong>AI数字遗产</strong>：基于您的明确授权与提供的资料，为您生成专属的AI复活模型、AI合成语音、AI视频及动图。</li>
        </ul>
        <h3 className="text-lg font-medium mt-4 mb-2">实体产品与服务：</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>实体出版物</strong>：根据您的数字传记制作实体书、实体影集。</li>
          <li><strong>时光胶囊</strong>：提供实物保管服务，并根据您的指定，在约定的时间自动寄送给指定收件人。</li>
          <li><strong>实体电子纪念碑</strong>：根据您的定制需求，制作数字与实体相结合的纪念碑（墓碑）。</li>
        </ul>
        <h3 className="text-lg font-medium mt-4 mb-2">定制化服务：</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>私人定制与专访</strong>：提供专业的私人定制服务，包括为用户进行私人专访，以丰富传记内容。</li>
        </ul>
        <h3 className="text-lg font-medium mt-4 mb-2">数字遗产管理：</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>数字遗产保存与管理</strong>：提供付费的数据长期保存服务，以确保您上传的数字资料得以长期安全地存储。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">二、用户权利与义务</h2>
        <h3 className="text-lg font-medium mt-4 mb-2">账户安全</h3>
        <p className="text-gray-700 mb-4">
          您应对您的账户信息及密码负全部责任。任何使用您账户进行的活动，均视为您本人的行为，由此产生的责任由您承担。
        </p>
        <h3 className="text-lg font-medium mt-4 mb-2">内容所有权与授权</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li>您对您上传的所有内容（包括文字、图片、音视频等）拥有完整的所有权。</li>
          <li>为履行本服务，您在此授予本公司一项非独家的、全球范围的、可再授权的、不可撤销的、免版税的许可，以存储、使用、复制、修改、编辑、分发、展示和公开您的内容，且该授权仅限于本服务条款约定的服务目的（包括但不限于：数字传记的展示、实体产品的制作、AI模型的生成等）。</li>
        </ul>
        <h3 className="text-lg font-medium mt-4 mb-2">内容合法性</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li>您保证您上传的所有内容均合法、真实、完整，不侵犯任何第三方的合法权益（包括但不限于肖像权、隐私权、知识产权等）。</li>
          <li>您不得上传任何违反法律法规、违反社会公德、或含有不良信息的资料。若因此导致任何纠纷或损失，您将承担全部责任。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">三、服务费用与支付</h2>
        <h3 className="text-lg font-medium mt-4 mb-2">收费服务</h3>
        <p className="text-gray-700 mb-4">
          本公司将对特定服务收取费用，包括但不限于“永恒计划”（用户资料存储）、AI服务、实体产品制作、时光胶囊、私人专访等。具体费用以服务页面公布的价格为准。
        </p>
        <h3 className="text-lg font-medium mt-4 mb-2">价格调整</h3>
        <p className="text-gray-700 mb-4">
          本公司保留在不时调整服务价格的权利，并将在调整前以适当方式通知您。
        </p>
        <h3 className="text-lg font-medium mt-4 mb-2">支付与退款</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li>所有定制化服务（包括实体出版物、实体纪念碑、专访等）因其个性化特点，一旦开始制作，原则上不支持退款。</li>
          <li>若因本公司原因导致服务无法履行，我们将退还相应费用。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">四、AI与数字遗产</h2>
        <h3 className="text-lg font-medium mt-4 mb-2">单独授权</h3>
        <p className="text-gray-700 mb-4">
          AI数字遗产服务为一项增值服务，您必须通过单独的协议或明确的勾选确认，授权本公司收集和使用您的生物识别数据。
        </p>
        <h3 className="text-lg font-medium mt-4 mb-2">肖像权与隐私权</h3>
        <p className="text-gray-700 mb-4">
          您在此保证您上传的所有用于AI训练的个人数据，均为您本人，且您拥有完整的肖像权和隐私权。
        </p>
        <h3 className="text-lg font-medium mt-4 mb-2">使用范围</h3>
        <p className="text-gray-700 mb-4">
          您理解并同意，您授权我们使用您的数据生成AI模型，仅用于为您提供本服务所约定的目的，即供您指定的后代在您逝世后进行了解和交互。我们承诺，不会将您的AI模型用于任何其他商业目的，也不会将其出售给任何第三方。
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-4">五、实体产品与时光胶囊</h2>
        <h3 className="text-lg font-medium mt-4 mb-2">实体产品</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>产品制作</strong>：您需对提交的设计稿或草稿进行最终确认，一经确认，本公司将按照该稿件进行制作，由此产生的任何修改责任由您承担。</li>
          <li><strong>运输风险</strong>：实体产品交付给物流公司后，所有权和风险即转移给您。</li>
        </ul>
        <h3 className="text-lg font-medium mt-4 mb-2">时光胶囊</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>物品责任</strong>：您应对时光胶囊内物品的合法性、安全性负责。我们不接受任何违禁品、易燃易爆品及其他危险物品。</li>
          <li><strong>不可抗力</strong>：尽管我们承诺妥善保管，但对于因自然灾害、战争、或本公司不可控制的因素导致的物品丢失或损坏，我们不承担责任。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">六、服务的终止与数据处理</h2>
        <h3 className="text-lg font-medium mt-4 mb-2">用户终止</h3>
        <p className="text-gray-700 mb-4">
          您可以随时注销账户，但在注销前，您已购买的“永恒计划”将视为自动放弃，费用不予退还。
        </p>
        <h3 className="text-lg font-medium mt-4 mb-2">公司终止</h3>
        <p className="text-gray-700 mb-4">
          若您违反本服务条款，我们有权随时暂停或终止向您提供服务，并有权删除您的相关数据。
        </p>
        <h3 className="text-lg font-medium mt-4 mb-2">数据处理</h3>
        <ul className="list-disc list-inside text-gray-700 mb-4">
          <li><strong>免费用户</strong>：您的数据将按照《隐私政策》中约定的期限进行保存。期限届满后，我们保留删除的权利。</li>
          <li><strong>“永恒计划”用户</strong>：您的数据将按照您所购买的服务承诺进行长期保存。</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-4">七、责任限制</h2>
        <p className="text-gray-700 mb-4">
          在法律允许的最大范围内，对于因使用或无法使用本服务而导致的任何间接、偶然、特殊、惩罚性或后果性损害，本公司不承担任何责任。
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-4">八、适用法律与争议解决</h2>
        <p className="text-gray-700 mb-4">
          本条款的订立、执行和解释及争议解决均适用中华人民共和国法律。若发生任何争议，双方应友好协商解决；协商不成的，任何一方有权向本公司所在地的人民法院提起诉讼。
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-4">九、条款的变更</h2>
        <p className="text-gray-700 mb-4">
          本公司有权随时修改本条款。修改后的条款将通过适当方式公布，并自公布之日起生效。若您在条款修改后继续使用本服务，即视为您已接受修改后的条款。
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-4">十、联系我们</h2>
        <p className="text-gray-700 mb-6">
          如果您对本条款有任何疑问，请通过以下方式联系我们：<a href="mailto:1056829015@qq.com" className="text-blue-600 hover:underline">1056829015@qq.com</a>。
        </p>

        <button className="btn bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition" onClick={() => navigate(-1)}>返回</button>
      </div>
    </div>
  );
};

export default Terms;
