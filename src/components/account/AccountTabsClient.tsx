'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import { alpha } from '@mui/material/styles'

import { brandTokens } from '@/theme/theme'
import AccountProfileTab from './AccountProfileTab'
import AccountOrdersTab from './AccountOrdersTab'
import AccountAddressesTab from './AccountAddressesTab'
import AccountPreferencesTab from './AccountPreferencesTab'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && children}
    </div>
  )
}

export function AccountTabsClient({
  customer,
  orders,
  addresses,
}: {
  customer: any
  orders: any[]
  addresses: any[]
}) {
  const [tabValue, setTabValue] = useState(0)

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  return (
    <Box>
      <Tabs
        value={tabValue}
        onChange={handleTabChange}
        sx={{
          borderBottom: `1px solid ${alpha(brandTokens.parchment, 0.2)}`,
          mb: 2.2,
        }}
      >
        <Tab label="Profile" />
        <Tab label="Orders" />
        <Tab label="Addresses" />
        <Tab label="Preferences" />
      </Tabs>

      <TabPanel value={tabValue} index={0}>
        <AccountProfileTab customer={customer} />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <AccountOrdersTab orders={orders} />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <AccountAddressesTab addresses={addresses} customerId={customer.id} />
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <AccountPreferencesTab customer={customer} />
      </TabPanel>
    </Box>
  )
}
