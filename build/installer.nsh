; Correctif pour le bug NSIS electron-builder 24.13.2/24.13.3
; "l'app ne peut pas être fermée / échec de désinstallation des anciens fichiers :2"
; https://github.com/electron-userland/electron-builder/issues/8131
; https://github.com/electron-userland/electron-builder/issues/9593

; customInit : supprime l'ancien uninstaller potentiellement cassé pour permettre
; l'installation (update) de continuer.
!macro customInit
  Delete "$INSTDIR\Uninstall*.exe"
!macroend

; customUnInstallCheck : désactive la vérification NSIS qui détecte à tort un
; process en cours et bloque la mise à jour.
!macro customUnInstallCheck
!macroend

; customRemoveFiles : supprime directement le dossier d'installation au lieu
; d'utiliser la suppression atomique défaillante qui fait échouer l'update.
!macro customRemoveFiles
  DetailPrint "Suppression des anciens fichiers..."
  RMDir /r "$INSTDIR"
!macroend
