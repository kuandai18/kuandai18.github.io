/**
 * data.js —— 宽带渠道数据（全站唯一事实来源）
 *
 * 字段说明：
 *   name   渠道名称（必填）：全站展示与 data.js 逐字一致
 *   url    办理 URL（必填）：全站办理链接的跳转目标，逐字符一致，禁止截断/重编码
 *   notice 操作提示（可选）：存在时须在主站入口与子站办理按钮旁完整展示原文
 *   slug   渠道标识（扩展）：子站子目录名，同时是 data-channel 属性值
 *   sub    子站路径（扩展）：主站卡片与友链的站内链接（相对路径，显式 index.html）
 *   intro  渠道简介（扩展）：主站卡片一句话定位文案
 *
 * 变更流程（design.md §4.2.4）：新增/修改渠道须一次性同步
 *   data.js → 主站卡片与友链 → 对应子站 → 全部子站友链 → sitemap.xml → llms.txt
 */
const kuandaiList = [
  {
    name: "星卡宽带",
    url: "https://ym.ksjhaoka.com/pages/index/index?keyword=%E5%AE%BD%E5%B8%A6&s=loshqy1H719207",
    slug: "xingka",
    sub: "xingka/index.html",
    intro: "星卡宽带在线办理入口，直达宽带专区，页面简洁，适合追求快速办理的用户。"
  },
  {
    name: '172宽带',
    url: 'https://ruijie.172xianxia.cn/kd_home/59bc0abc9a7d31f5',
    slug: 'r172',
    sub: 'r172/index.html',
    intro: '172宽带办理入口，主打大带宽家庭宽带，适合全屋多设备高速上网。'
  },
  {
    name: '好卡新耀宽带',
    url: 'https://www.haokaxinyao.com/#/pages/sales_index/default_card?agent_id=4714419&tab_name=broadband&title=%25E5%25AE%25BD%25E5%25B8%25A6&product_type=broadband',
    slug: 'xinyao',
    sub: 'xinyao/index.html',
    intro: '好卡新耀宽带频道入口，多档宽带套餐在线选购，流程清晰。'
  },
  {
    name: '咔咔通信宽带',
    url: 'https://haoka.kakatx.com/web/#/pages/index/broadband/?token=MjY2NzIxfDE3OTIzNzQxMTkwNDdoYW9rYTY2Ng',
    slug: 'kaka',
    sub: 'kaka/index.html',
    intro: '咔咔通信宽带专区入口，直达宽带商品页，办理路径短。'
  },
  {
    name: '蛋蛋宽带',
    url: 'https://ka.dandanhou.net/index?k=N0JpQm5nd0ZzazQ9',
    notice: "进入默认是号卡，需要切换到宽带",
    slug: 'dandan',
    sub: 'dandan/index.html',
    intro: '蛋蛋宽带入口，进入官方页后需切换到宽带分类，套餐形式灵活。'
  },
  {
    name: '灵渠宽带',
    url: 'https://lingqu.87haoka.cn/shop#/?indexFirstGroup=4&promoCode=Cf3HUSBk',
    slug: 'lingqu',
    sub: 'lingqu/index.html',
    intro: '灵渠宽带店铺入口，直达宽带商品分组，促销信息以页面为准。'
  }
]
