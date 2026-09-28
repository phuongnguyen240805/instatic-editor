import { ladipagePagesListUrl } from './hostMode'

export function LadipageHostAuthScreen() {
  const listUrl = ladipagePagesListUrl()
  return (
    <div data-ladipage-auth role="alert">
      <p>Không mở được trình sửa landing.</p>
      <p>Hãy quay lại LadiPage và mở lại trang từ danh sách landing.</p>
      <a data-ladipage-back href={listUrl}>
        Về danh sách landing
      </a>
    </div>
  )
}
