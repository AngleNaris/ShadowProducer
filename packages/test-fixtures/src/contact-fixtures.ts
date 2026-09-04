export const personalContactFixtures = [
  {
    id: "personal-contact-linqiao",
    ownerAccountId: "account-fanxing",
    name: "林乔",
    role: "导演",
    company: "自由职业",
    phone: "138 0000 1288",
    email: "linqiao@example.com",
  },
  {
    id: "personal-contact-luchuan",
    ownerAccountId: "account-fanxing",
    name: "陆川",
    role: "灯光师",
    company: "光域器材",
    phone: "139 0000 6731",
    email: "luchuan@example.com",
  },
  {
    id: "personal-contact-sunwei",
    ownerAccountId: "account-fanxing",
    name: "孙苇",
    role: "场地经理",
    company: "城际场务",
    phone: "136 0000 9054",
    email: "sunwei@example.com",
  },
] as const

export const contactShareFixtures = [
  {
    contactId: "personal-contact-linqiao",
    teamId: "north",
    fields: ["name", "role", "phone"],
    allowProjectLink: true,
  },
  {
    contactId: "personal-contact-sunwei",
    teamId: "north",
    fields: ["name", "role", "company", "phone"],
    allowProjectLink: true,
  },
] as const

export const teamContactFixtures = [
  {
    id: "team-contact-rain-fx",
    teamId: "north",
    name: "赵衡",
    role: "现场特效协调",
    company: "远景现场特效",
    phone: "021 6820 1138",
    email: "dispatch@rainfx.example.com",
    projectIds: ["winter-coffee"],
  },
  {
    id: "team-contact-station-office",
    teamId: "north",
    name: "许主任",
    role: "场地协调",
    company: "北站运营处",
    phone: "021 5508 6201",
    email: "location@northstation.example.com",
    projectIds: ["winter-coffee", "city-walk"],
  },
] as const

export const supplierFixtures = [
  {
    id: "supplier-rain-fx",
    teamId: "north",
    name: "远景现场特效",
    category: "服务组织",
    services: "人工雨、雨车与现场水效保障",
    phone: "021 6820 1138",
    email: "dispatch@rainfx.example.com",
    address: "上海市松江区影视路 18 号",
    projectIds: ["winter-coffee"],
    contactRefs: [{ contactId: "team-contact-rain-fx", source: "team" as const }],
  },
  {
    id: "supplier-north-station",
    teamId: "north",
    name: "北站运营处",
    category: "场地",
    services: "站台拍摄协调、封控与轨道安全支持",
    phone: "021 5508 6201",
    email: "location@northstation.example.com",
    address: "北岸市北站路 1 号",
    projectIds: ["winter-coffee", "city-walk"],
    contactRefs: [{ contactId: "team-contact-station-office", source: "team" as const }],
  },
] as const
