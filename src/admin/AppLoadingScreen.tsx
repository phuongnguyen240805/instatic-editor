import styles from './AppLoadingScreen.module.css'
import { isLadipageHostMode } from './ladipage/hostMode'

export function AppLoadingScreen() {
  const label = isLadipageHostMode() ? 'Loading LadiPage editor' : 'Loading Instatic'
  return (
    <div
      className={styles.screen}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <BanterLoader />
    </div>
  )
}

function BanterLoader() {
  return (
    <div
      className={styles.banterLoader}
      data-loader-spinner="true"
      aria-hidden="true"
    >
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
      <div className={styles.banterBox} />
    </div>
  )
}
