import { ladipagePagesListUrl } from './hostMode'

export function BackToLadipageLink() {
  return (
    <a data-ladipage-back href={ladipagePagesListUrl()}>
      Danh sách landing
    </a>
  )
}
