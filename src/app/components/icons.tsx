import React from "react";
import {
  AddIcon as LAdd,
  AddFolderIcon as LAddFolder,
  AltArrowDownIcon as LAltArrowDown,
  AltArrowLeftIcon as LAltArrowLeft,
  AltArrowRightIcon as LAltArrowRight,
  AltArrowUpIcon as LAltArrowUp,
  ArrowRightIcon as LArrowRight,
  BellIcon as LBell,
  BoltIcon as LBolt,
  Book2Icon as LBook2,
  BookBookmarkIcon as LBookBookmark,
  BoxIcon as LBox,
  BrainIcon as LBrain,
  CameraIcon as LCamera,
  CartLargeIcon as LCartLarge,
  CaseRoundIcon as LCaseRound,
  Chart2Icon as LChart2,
  ChatRoundDotsIcon as LChatRoundDots,
  CheckIcon as LCheck,
  CheckCircleIcon as LCheckCircle,
  CheckSquareIcon as LCheckSquare,
  CircleDotIcon as LCircleDot,
  ClapperboardPlayIcon as LClapperboardPlay,
  ClipboardTextIcon as LClipboardText,
  ClockCircleIcon as LClockCircle,
  CloseIcon as LClose,
  CloseCircleIcon as LCloseCircle,
  CloudIcon as LCloud,
  CodeIcon as LCode,
  CompassIcon as LCompass,
  CopyIcon as LCopy,
  CpuIcon as LCpu,
  CrownMinimalisticIcon as LCrownMinimalistic,
  CupFirstIcon as LCupFirst,
  DangerCircleIcon as LDangerCircle,
  DangerTriangleIcon as LDangerTriangle,
  DatabaseIcon as LDatabase,
  DocumentTextIcon as LDocumentText,
  DownloadMinimalisticIcon as LDownloadMinimalistic,
  EyeIcon as LEye,
  EyeClosedIcon as LEyeClosed,
  FileDownloadIcon as LFileDownload,
  FireIcon as LFire,
  FlagIcon as LFlag,
  FlipHorizontalIcon as LFlipHorizontal,
  FolderSyncIcon as LFolderSync,
  FullScreenIcon as LFullScreen,
  GlobalIcon as LGlobal,
  GraphUpIcon as LGraphUp,
  GripVerticalIcon as LGripVertical,
  HistoryIcon as LHistory,
  InfoCircleIcon as LInfoCircle,
  KeyIcon as LKey,
  KeyboardIcon as LKeyboard,
  LayersIcon as LLayers,
  LetterIcon as LLetter,
  LightbulbBoltIcon as LLightbulbBolt,
  ListIcon as LList,
  ListOrderedIcon as LListOrdered,
  LoaderIcon as LLoader,
  LockKeyholeIcon as LLockKeyhole,
  LoginIcon as LLogin,
  LogoutIcon as LLogout,
  MagicWand2Icon as LMagicWand2,
  MagnifierIcon as LMagnifier,
  MedalRibbonStarIcon as LMedalRibbonStar,
  MoneyBagIcon as LMoneyBag,
  MoonStarsIcon as LMoonStars,
  PaletteRoundIcon as LPaletteRound,
  PauseIcon as LPause,
  PenIcon as LPen,
  PinIcon as LPin,
  PlayIcon as LPlay,
  PlayCircleIcon as LPlayCircle,
  QuestionCircleIcon as LQuestionCircle,
  RadioIcon as LRadio,
  RefreshIcon as LRefresh,
  RepeatIcon as LRepeat,
  RestartIcon as LRestart,
  RewindForwardIcon as LRewindForward,
  RocketIcon as LRocket,
  SendSquareIcon as LSendSquare,
  ServerIcon as LServer,
  SettingsIcon as LSettings,
  SkipNextIcon as LSkipNext,
  SkipPreviousIcon as LSkipPrevious,
  SortVerticalIcon as LSortVertical,
  SquareAcademicCapIcon as LSquareAcademicCap,
  SquareArrowRightUpIcon as LSquareArrowRightUp,
  SsdRoundIcon as LSsdRound,
  StarIcon as LStar,
  StarsMinimalisticIcon as LStarsMinimalistic,
  StopwatchIcon as LStopwatch,
  SunIcon as LSun,
  TargetIcon as LTarget,
  TextBoldIcon as LTextBold,
  TextFormatIcon as LTextFormat,
  ToolboxIcon as LToolbox,
  TransferHorizontalIcon as LTransferHorizontal,
  TranslationIcon as LTranslation,
  TrashBinMinimalisticIcon as LTrashBinMinimalistic,
  Tuning2Icon as LTuning2,
  UndoLeftRoundIcon as LUndoLeftRound,
  UploadMinimalisticIcon as LUploadMinimalistic,
  UserPlusIcon as LUserPlus,
  UsersGroupRoundedIcon as LUsersGroupRounded,
  VideoFramePlayHorizontalIcon as LVideoFramePlayHorizontal,
  VolumeCrossIcon as LVolumeCross,
  VolumeLoudIcon as LVolumeLoud,
  WiFiIcon as LWiFi,
  WiFiHighIcon as LWiFiHigh,
  WiFiLowIcon as LWiFiLow,
  WiFiNoneIcon as LWiFiNone,
  WiFiOffIcon as LWiFiOff,
  Widget2Icon as LWidget2,
  ArrowUpIcon as LArrowUp,
  ArrowDownIcon as LArrowDown,
  MoveVerticalIcon as LMoveVertical,
  SadCircleIcon as LSadCircle,
  ExpressionlessCircleIcon as LExpressionlessCircle,
  SmileCircleIcon as LSmileCircle,
  EmojiFunnyCircleIcon as LEmojiFunnyCircle,
} from "@solar-icons/react/linear";
import {
  AddIcon as DAdd,
  AddFolderIcon as DAddFolder,
  AltArrowDownIcon as DAltArrowDown,
  AltArrowLeftIcon as DAltArrowLeft,
  AltArrowRightIcon as DAltArrowRight,
  AltArrowUpIcon as DAltArrowUp,
  ArrowRightIcon as DArrowRight,
  BellIcon as DBell,
  BoltIcon as DBolt,
  Book2Icon as DBook2,
  BookBookmarkIcon as DBookBookmark,
  BoxIcon as DBox,
  BrainIcon as DBrain,
  CameraIcon as DCamera,
  CartLargeIcon as DCartLarge,
  CaseRoundIcon as DCaseRound,
  Chart2Icon as DChart2,
  ChatRoundDotsIcon as DChatRoundDots,
  CheckIcon as DCheck,
  CheckCircleIcon as DCheckCircle,
  CheckSquareIcon as DCheckSquare,
  CircleDotIcon as DCircleDot,
  ClapperboardPlayIcon as DClapperboardPlay,
  ClipboardTextIcon as DClipboardText,
  ClockCircleIcon as DClockCircle,
  CloseIcon as DClose,
  CloseCircleIcon as DCloseCircle,
  CloudIcon as DCloud,
  CodeIcon as DCode,
  CompassIcon as DCompass,
  CopyIcon as DCopy,
  CpuIcon as DCpu,
  CrownMinimalisticIcon as DCrownMinimalistic,
  CupFirstIcon as DCupFirst,
  DangerCircleIcon as DDangerCircle,
  DangerTriangleIcon as DDangerTriangle,
  DatabaseIcon as DDatabase,
  DocumentTextIcon as DDocumentText,
  DownloadMinimalisticIcon as DDownloadMinimalistic,
  EyeIcon as DEye,
  EyeClosedIcon as DEyeClosed,
  FileDownloadIcon as DFileDownload,
  FireIcon as DFire,
  FlagIcon as DFlag,
  FlipHorizontalIcon as DFlipHorizontal,
  FolderSyncIcon as DFolderSync,
  FullScreenIcon as DFullScreen,
  GlobalIcon as DGlobal,
  GraphUpIcon as DGraphUp,
  GripVerticalIcon as DGripVertical,
  HistoryIcon as DHistory,
  InfoCircleIcon as DInfoCircle,
  KeyIcon as DKey,
  KeyboardIcon as DKeyboard,
  LayersIcon as DLayers,
  LetterIcon as DLetter,
  LightbulbBoltIcon as DLightbulbBolt,
  ListIcon as DList,
  ListOrderedIcon as DListOrdered,
  LoaderIcon as DLoader,
  LockKeyholeIcon as DLockKeyhole,
  LoginIcon as DLogin,
  LogoutIcon as DLogout,
  MagicWand2Icon as DMagicWand2,
  MagnifierIcon as DMagnifier,
  MedalRibbonStarIcon as DMedalRibbonStar,
  MoneyBagIcon as DMoneyBag,
  MoonStarsIcon as DMoonStars,
  PaletteRoundIcon as DPaletteRound,
  PauseIcon as DPause,
  PenIcon as DPen,
  PinIcon as DPin,
  PlayIcon as DPlay,
  PlayCircleIcon as DPlayCircle,
  QuestionCircleIcon as DQuestionCircle,
  RadioIcon as DRadio,
  RefreshIcon as DRefresh,
  RepeatIcon as DRepeat,
  RestartIcon as DRestart,
  RewindForwardIcon as DRewindForward,
  RocketIcon as DRocket,
  SendSquareIcon as DSendSquare,
  ServerIcon as DServer,
  SettingsIcon as DSettings,
  SkipNextIcon as DSkipNext,
  SkipPreviousIcon as DSkipPrevious,
  SortVerticalIcon as DSortVertical,
  SquareAcademicCapIcon as DSquareAcademicCap,
  SquareArrowRightUpIcon as DSquareArrowRightUp,
  SsdRoundIcon as DSsdRound,
  StarIcon as DStar,
  StarsMinimalisticIcon as DStarsMinimalistic,
  StopwatchIcon as DStopwatch,
  SunIcon as DSun,
  TargetIcon as DTarget,
  TextBoldIcon as DTextBold,
  TextFormatIcon as DTextFormat,
  ToolboxIcon as DToolbox,
  TransferHorizontalIcon as DTransferHorizontal,
  TranslationIcon as DTranslation,
  TrashBinMinimalisticIcon as DTrashBinMinimalistic,
  Tuning2Icon as DTuning2,
  UndoLeftRoundIcon as DUndoLeftRound,
  UploadMinimalisticIcon as DUploadMinimalistic,
  UserPlusIcon as DUserPlus,
  UsersGroupRoundedIcon as DUsersGroupRounded,
  VideoFramePlayHorizontalIcon as DVideoFramePlayHorizontal,
  VolumeCrossIcon as DVolumeCross,
  VolumeLoudIcon as DVolumeLoud,
  WiFiIcon as DWiFi,
  WiFiHighIcon as DWiFiHigh,
  WiFiLowIcon as DWiFiLow,
  WiFiNoneIcon as DWiFiNone,
  WiFiOffIcon as DWiFiOff,
  Widget2Icon as DWidget2,
  ArrowUpIcon as DArrowUp,
  ArrowDownIcon as DArrowDown,
  MoveVerticalIcon as DMoveVertical,
  SadCircleIcon as DSadCircle,
  ExpressionlessCircleIcon as DExpressionlessCircle,
  SmileCircleIcon as DSmileCircle,
  EmojiFunnyCircleIcon as DEmojiFunnyCircle,
} from "@solar-icons/react/bold-duotone";
import {
  AddIcon as BAdd,
  AddFolderIcon as BAddFolder,
  AltArrowDownIcon as BAltArrowDown,
  AltArrowLeftIcon as BAltArrowLeft,
  AltArrowRightIcon as BAltArrowRight,
  AltArrowUpIcon as BAltArrowUp,
  ArrowRightIcon as BArrowRight,
  BellIcon as BBell,
  BoltIcon as BBolt,
  Book2Icon as BBook2,
  BookBookmarkIcon as BBookBookmark,
  BoxIcon as BBox,
  BrainIcon as BBrain,
  CameraIcon as BCamera,
  CartLargeIcon as BCartLarge,
  CaseRoundIcon as BCaseRound,
  Chart2Icon as BChart2,
  ChatRoundDotsIcon as BChatRoundDots,
  CheckIcon as BCheck,
  CheckCircleIcon as BCheckCircle,
  CheckSquareIcon as BCheckSquare,
  CircleDotIcon as BCircleDot,
  ClapperboardPlayIcon as BClapperboardPlay,
  ClipboardTextIcon as BClipboardText,
  ClockCircleIcon as BClockCircle,
  CloseIcon as BClose,
  CloseCircleIcon as BCloseCircle,
  CloudIcon as BCloud,
  CodeIcon as BCode,
  CompassIcon as BCompass,
  CopyIcon as BCopy,
  CpuIcon as BCpu,
  CrownMinimalisticIcon as BCrownMinimalistic,
  CupFirstIcon as BCupFirst,
  DangerCircleIcon as BDangerCircle,
  DangerTriangleIcon as BDangerTriangle,
  DatabaseIcon as BDatabase,
  DocumentTextIcon as BDocumentText,
  DownloadMinimalisticIcon as BDownloadMinimalistic,
  EyeIcon as BEye,
  EyeClosedIcon as BEyeClosed,
  FileDownloadIcon as BFileDownload,
  FireIcon as BFire,
  FlagIcon as BFlag,
  FlipHorizontalIcon as BFlipHorizontal,
  FolderSyncIcon as BFolderSync,
  FullScreenIcon as BFullScreen,
  GlobalIcon as BGlobal,
  GraphUpIcon as BGraphUp,
  GripVerticalIcon as BGripVertical,
  HistoryIcon as BHistory,
  InfoCircleIcon as BInfoCircle,
  KeyIcon as BKey,
  KeyboardIcon as BKeyboard,
  LayersIcon as BLayers,
  LetterIcon as BLetter,
  LightbulbBoltIcon as BLightbulbBolt,
  ListIcon as BList,
  ListOrderedIcon as BListOrdered,
  LoaderIcon as BLoader,
  LockKeyholeIcon as BLockKeyhole,
  LoginIcon as BLogin,
  LogoutIcon as BLogout,
  MagicWand2Icon as BMagicWand2,
  MagnifierIcon as BMagnifier,
  MedalRibbonStarIcon as BMedalRibbonStar,
  MoneyBagIcon as BMoneyBag,
  MoonStarsIcon as BMoonStars,
  PaletteRoundIcon as BPaletteRound,
  PauseIcon as BPause,
  PenIcon as BPen,
  PinIcon as BPin,
  PlayIcon as BPlay,
  PlayCircleIcon as BPlayCircle,
  QuestionCircleIcon as BQuestionCircle,
  RadioIcon as BRadio,
  RefreshIcon as BRefresh,
  RepeatIcon as BRepeat,
  RestartIcon as BRestart,
  RewindForwardIcon as BRewindForward,
  RocketIcon as BRocket,
  SendSquareIcon as BSendSquare,
  ServerIcon as BServer,
  SettingsIcon as BSettings,
  SkipNextIcon as BSkipNext,
  SkipPreviousIcon as BSkipPrevious,
  SortVerticalIcon as BSortVertical,
  SquareAcademicCapIcon as BSquareAcademicCap,
  SquareArrowRightUpIcon as BSquareArrowRightUp,
  SsdRoundIcon as BSsdRound,
  StarIcon as BStar,
  StarsMinimalisticIcon as BStarsMinimalistic,
  StopwatchIcon as BStopwatch,
  SunIcon as BSun,
  TargetIcon as BTarget,
  TextBoldIcon as BTextBold,
  TextFormatIcon as BTextFormat,
  ToolboxIcon as BToolbox,
  TransferHorizontalIcon as BTransferHorizontal,
  TranslationIcon as BTranslation,
  TrashBinMinimalisticIcon as BTrashBinMinimalistic,
  Tuning2Icon as BTuning2,
  UndoLeftRoundIcon as BUndoLeftRound,
  UploadMinimalisticIcon as BUploadMinimalistic,
  UserPlusIcon as BUserPlus,
  UsersGroupRoundedIcon as BUsersGroupRounded,
  VideoFramePlayHorizontalIcon as BVideoFramePlayHorizontal,
  VolumeCrossIcon as BVolumeCross,
  VolumeLoudIcon as BVolumeLoud,
  WiFiIcon as BWiFi,
  WiFiHighIcon as BWiFiHigh,
  WiFiLowIcon as BWiFiLow,
  WiFiNoneIcon as BWiFiNone,
  WiFiOffIcon as BWiFiOff,
  Widget2Icon as BWidget2,
  ArrowUpIcon as BArrowUp,
  ArrowDownIcon as BArrowDown,
  MoveVerticalIcon as BMoveVertical,
  SadCircleIcon as BSadCircle,
  ExpressionlessCircleIcon as BExpressionlessCircle,
  SmileCircleIcon as BSmileCircle,
  EmojiFunnyCircleIcon as BEmojiFunnyCircle,
} from "@solar-icons/react/bold";

/** Kinema usa Solar Icons (480 Design): Linear en tamaños pequeños, Bold Duotone en acentos, Bold para énfasis. */
type SolarComp = React.ComponentType<{ size?: number | string; color?: string; strokeWidth?: number | string; className?: string; style?: React.CSSProperties }>;
export const ICONS = {
  play: [LPlay, DPlay, BPlay],
  pause: [LPause, DPause, BPause],
  skipForward: [LSkipNext, DSkipNext, BSkipNext],
  skipBack: [LSkipPrevious, DSkipPrevious, BSkipPrevious],
  fastForward: [LRewindForward, DRewindForward, BRewindForward],
  volume2: [LVolumeLoud, DVolumeLoud, BVolumeLoud],
  volumeX: [LVolumeCross, DVolumeCross, BVolumeCross],
  maximize: [LFullScreen, DFullScreen, BFullScreen],
  playCircle: [LPlayCircle, DPlayCircle, BPlayCircle],
  playSquare: [LVideoFramePlayHorizontal, DVideoFramePlayHorizontal, BVideoFramePlayHorizontal],
  clapper: [LClapperboardPlay, DClapperboardPlay, BClapperboardPlay],
  camera: [LCamera, DCamera, BCamera],
  chevronDown: [LAltArrowDown, DAltArrowDown, BAltArrowDown],
  chevronUp: [LAltArrowUp, DAltArrowUp, BAltArrowUp],
  chevronRight: [LAltArrowRight, DAltArrowRight, BAltArrowRight],
  chevronLeft: [LAltArrowLeft, DAltArrowLeft, BAltArrowLeft],
  arrowRight: [LArrowRight, DArrowRight, BArrowRight],
  arrowUpDown: [LArrowUp, DArrowUp, BArrowUp],
  compare: [LTransferHorizontal, DTransferHorizontal, BTransferHorizontal],
  externalLink: [LSquareArrowRightUp, DSquareArrowRightUp, BSquareArrowRightUp],
  trendingUp: [LGraphUp, DGraphUp, BGraphUp],
  check: [LCheck, DCheck, BCheck],
  x: [LClose, DClose, BClose],
  plus: [LAdd, DAdd, BAdd],
  search: [LMagnifier, DMagnifier, BMagnifier],
  trash2: [LTrashBinMinimalistic, DTrashBinMinimalistic, BTrashBinMinimalistic],
  download: [LDownloadMinimalistic, DDownloadMinimalistic, BDownloadMinimalistic],
  upload: [LUploadMinimalistic, DUploadMinimalistic, BUploadMinimalistic],
  send: [LSendSquare, DSendSquare, BSendSquare],
  copy: [LCopy, DCopy, BCopy],
  clipboardCopy: [LClipboardText, DClipboardText, BClipboardText],
  edit3: [LPen, DPen, BPen],
  wand2: [LMagicWand2, DMagicWand2, BMagicWand2],
  refreshCw: [LRefresh, DRefresh, BRefresh],
  refreshCcw: [LRestart, DRestart, BRestart],
  rotateCcw: [LUndoLeftRound, DUndoLeftRound, BUndoLeftRound],
  repeat2: [LRepeat, DRepeat, BRepeat],
  flipHorizontal: [LFlipHorizontal, DFlipHorizontal, BFlipHorizontal],
  history: [LHistory, DHistory, BHistory],
  login: [LLogin, DLogin, BLogin],
  logout: [LLogout, DLogout, BLogout],
  userPlus: [LUserPlus, DUserPlus, BUserPlus],
  checkCircle2: [LCheckCircle, DCheckCircle, BCheckCircle],
  xCircle: [LCloseCircle, DCloseCircle, BCloseCircle],
  alertCircle: [LDangerCircle, DDangerCircle, BDangerCircle],
  warning: [LDangerTriangle, DDangerTriangle, BDangerTriangle],
  helpCircle: [LQuestionCircle, DQuestionCircle, BQuestionCircle],
  info: [LInfoCircle, DInfoCircle, BInfoCircle],
  circle: [LCircleDot, DCircleDot, BCircleDot],
  loader2: [LLoader, DLoader, BLoader],
  wifi: [LWiFiHigh, DWiFiHigh, BWiFiHigh],
  wifiOff: [LWiFiOff, DWiFiOff, BWiFiOff],
  face1: [LSadCircle, DSadCircle, BSadCircle],
  face2: [LExpressionlessCircle, DExpressionlessCircle, BExpressionlessCircle],
  face3: [LSmileCircle, DSmileCircle, BSmileCircle],
  face4: [LEmojiFunnyCircle, DEmojiFunnyCircle, BEmojiFunnyCircle],
  signal1: [LWiFiNone, DWiFiNone, BWiFiNone],
  signal2: [LWiFiLow, DWiFiLow, BWiFiLow],
  signal3: [LWiFi, DWiFi, BWiFi],
  signal4: [LWiFiHigh, DWiFiHigh, BWiFiHigh],
  settings: [LSettings, DSettings, BSettings],
  settings2: [LTuning2, DTuning2, BTuning2],
  lock: [LLockKeyhole, DLockKeyhole, BLockKeyhole],
  key: [LKey, DKey, BKey],
  mail: [LLetter, DLetter, BLetter],
  eye: [LEye, DEye, BEye],
  eyeOff: [LEyeClosed, DEyeClosed, BEyeClosed],
  bell: [LBell, DBell, BBell],
  globe: [LGlobal, DGlobal, BGlobal],
  keyboard: [LKeyboard, DKeyboard, BKeyboard],
  gripHorizontal: [LGripVertical, DGripVertical, BGripVertical],
  cpu: [LCpu, DCpu, BCpu],
  server: [LServer, DServer, BServer],
  database: [LDatabase, DDatabase, BDatabase],
  hardDrive: [LSsdRound, DSsdRound, BSsdRound],
  cloud: [LCloud, DCloud, BCloud],
  radio: [LRadio, DRadio, BRadio],
  moon: [LMoonStars, DMoonStars, BMoonStars],
  sun: [LSun, DSun, BSun],
  users: [LUsersGroupRounded, DUsersGroupRounded, BUsersGroupRounded],
  clock: [LClockCircle, DClockCircle, BClockCircle],
  timer: [LStopwatch, DStopwatch, BStopwatch],
  shoppingCart: [LCartLarge, DCartLarge, BCartLarge],
  fileText: [LDocumentText, DDocumentText, BDocumentText],
  fileDown: [LFileDownload, DFileDownload, BFileDownload],
  folderPlus: [LAddFolder, DAddFolder, BAddFolder],
  folderSync: [LFolderSync, DFolderSync, BFolderSync],
  messageSquare: [LChatRoundDots, DChatRoundDots, BChatRoundDots],
  bookOpen: [LBook2, DBook2, BBook2],
  bookMarked: [LBookBookmark, DBookBookmark, BBookBookmark],
  layers: [LLayers, DLayers, BLayers],
  package: [LBox, DBox, BBox],
  languages: [LTranslation, DTranslation, BTranslation],
  type: [LTextFormat, DTextFormat, BTextFormat],
  alignCenter: [LMoveVertical, DMoveVertical, BMoveVertical],
  baseline: [LArrowDown, DArrowDown, BArrowDown],
  barChart2: [LChart2, DChart2, BChart2],
  steps: [LListOrdered, DListOrdered, BListOrdered],
  code: [LCode, DCode, BCode],
  briefcase: [LCaseRound, DCaseRound, BCaseRound],
  palette: [LPaletteRound, DPaletteRound, BPaletteRound],
  puzzle: [LWidget2, DWidget2, BWidget2],
  graduation: [LSquareAcademicCap, DSquareAcademicCap, BSquareAcademicCap],
  target: [LTarget, DTarget, BTarget],
  brain: [LBrain, DBrain, BBrain],
  rocket: [LRocket, DRocket, BRocket],
  wrench: [LToolbox, DToolbox, BToolbox],
  trophy: [LCupFirst, DCupFirst, BCupFirst],
  award: [LMedalRibbonStar, DMedalRibbonStar, BMedalRibbonStar],
  flag: [LFlag, DFlag, BFlag],
  pin: [LPin, DPin, BPin],
  compass: [LCompass, DCompass, BCompass],
  coins: [LMoneyBag, DMoneyBag, BMoneyBag],
  lightbulb: [LLightbulbBolt, DLightbulbBolt, BLightbulbBolt],
  zap: [LBolt, DBolt, BBolt],
  flame: [LFire, DFire, BFire],
  star: [LStar, DStar, BStar],
  diamond: [LCrownMinimalistic, DCrownMinimalistic, BCrownMinimalistic],
  sparkles: [LStarsMinimalistic, DStarsMinimalistic, BStarsMinimalistic],
  checkSquare: [LCheckSquare, DCheckSquare, BCheckSquare],
} as unknown as Record<string, readonly [SolarComp, SolarComp, SolarComp]>;

export type IconName = keyof typeof ICONS;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "ref" | "size" | "weight"> {
  size?: number | string;
  strokeWidth?: number | string;
  /** "regular" = Linear, "duotone" = Bold Duotone, "fill" | "bold" = Bold. Por defecto: duotone desde 18px. */
  weight?: "light" | "regular" | "duotone" | "fill" | "bold";
}

export function Icon({
  name,
  size = 20,
  strokeWidth,
  weight,
  className,
  ...rest
}: IconProps & { name: IconName }) {
  const set = ICONS[name] ?? ICONS.target;
  const dim = typeof size === "number" ? `calc(${size}px * var(--usb-scale, 1))` : size;
  const auto = typeof size === "number" && size >= 18 && strokeWidth === undefined ? "duotone" : "regular";
  const w = weight ?? auto;
  const C = w === "duotone" ? set[1] : w === "fill" || w === "bold" ? set[2] : set[0];
  const sw = Number(strokeWidth);
  return (
    <C
      size={dim}
      {...(w === "regular" || w === "light" ? { strokeWidth: sw ? Math.min(2.2, Math.max(1.4, sw)) : typeof size === "number" && size < 16 ? 2 : 1.7 } : {})}
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
      {...(rest as object)}
    />
  );
}

const make = (name: IconName) => {
  const C = (props: IconProps) => <Icon name={name} {...props} />;
  C.displayName = `Icon(${name})`;
  return C;
};

// ── API compatible con los nombres que ya usan los componentes ──────────
export const Play = make("play");
export const Pause = make("pause");
export const Volume2 = make("volume2");
export const VolumeX = make("volumeX");
export const Settings = make("settings");
export const Settings2 = make("settings2");
export const Maximize = make("maximize");
export const SkipForward = make("skipForward");
export const SkipBack = make("skipBack");
export const FastForward = make("fastForward");
export const ChevronDown = make("chevronDown");
export const ChevronUp = make("chevronUp");
export const ChevronRight = make("chevronRight");
export const ChevronLeft = make("chevronLeft");
export const Users = make("users");
export const Clock = make("clock");
export const CheckSquare = make("checkSquare");
export const Lock = make("lock");
export const PlayCircle = make("playCircle");
export const PlaySquare = make("playSquare");
export const FileText = make("fileText");
export const FileDown = make("fileDown");
export const MessageSquare = make("messageSquare");
export const BookOpen = make("bookOpen");
export const BookMarked = make("bookMarked");
export const Search = make("search");
export const Bell = make("bell");
export const Globe = make("globe");
export const ShoppingCart = make("shoppingCart");
export const Camera = make("camera");
export const Brain = make("brain");
export const BrainCircuit = make("brain");
export const Rocket = make("rocket");
export const Eye = make("eye");
export const EyeOff = make("eyeOff");
export const CheckCircle2 = make("checkCircle2");
export const Check = make("check");
export const X = make("x");
export const Plus = make("plus");
export const Trash2 = make("trash2");
export const AlertCircle = make("alertCircle");
export const HelpCircle = make("helpCircle");
export const Info = make("info");
export const Circle = make("circle");
export const Cpu = make("cpu");
export const Loader2 = make("loader2");
export const Zap = make("zap");
export const Radio = make("radio");
export const Server = make("server");
export const Sparkles = make("sparkles");
export const KeyRound = make("key");
export const Key = make("key");
export const Layers = make("layers");
export const ArrowRight = make("arrowRight");
export const HardDrive = make("hardDrive");
export const Mail = make("mail");
export const LogIn = make("login");
export const UserPlus = make("userPlus");
export const Database = make("database");
export const RefreshCw = make("refreshCw");
export const RefreshCcw = make("refreshCcw");
export const RotateCcw = make("rotateCcw");
export const BarChart2 = make("barChart2");
export const Wifi = make("wifi");
export const WifiOff = make("wifiOff");
export const Download = make("download");
export const Upload = make("upload");
export const Type = make("type");
export const AlignCenter = make("alignCenter");
export const ArrowUpDown = make("arrowUpDown");
export const Baseline = make("baseline");
export const GripHorizontal = make("gripHorizontal");
export const Keyboard = make("keyboard");
export const History = make("history");
export const Award = make("award");
export const Target = make("target");
export const Wand2 = make("wand2");
export const Edit3 = make("edit3");
export const FlipHorizontal = make("flipHorizontal");
export const FolderPlus = make("folderPlus");
export const FolderSync = make("folderSync");
export const Send = make("send");
export const Star = make("star");
export const Repeat2 = make("repeat2");
export const Package = make("package");
export const Diamond = make("diamond");
export const Flame = make("flame");
export const ClipboardCopy = make("clipboardCopy");
export const Copy = make("copy");
export const ExternalLink = make("externalLink");
export const Languages = make("languages");
export const TrendingUp = make("trendingUp");
export const Cloud = make("cloud");
export const Moon = make("moon");
export const Sun = make("sun");
export const LogOut = make("logout");

// ── Glifos semánticos (sustituyen a los emojis) ─────────────────────────
const EMOJI_TO_ICON: Record<string, IconName> = {
  "🎯": "target", "🚀": "rocket", "🛠": "wrench", "🏆": "trophy", "🧠": "brain",
  "💰": "coins", "⚡": "zap", "💻": "code", "💼": "briefcase", "🧩": "puzzle",
  "🔄": "compare", "📋": "steps", "📖": "bookOpen", "✍": "edit3", "💡": "lightbulb",
  "✅": "checkCircle2", "❌": "xCircle", "⚠": "warning", "🔁": "repeat2",
  "🎓": "graduation", "📌": "pin", "🧭": "compass", "🏁": "flag", "📄": "fileText",
  "🎨": "palette", "⏱": "timer", "🔥": "flame", "☁": "cloud", "👋": "sparkles",
  "⬇": "download", "💾": "hardDrive", "🔒": "lock", "🎬": "clapper",
  "💬": "messageSquare", "⚙": "settings", "🕘": "history", "⌨": "keyboard",
  "🌙": "moon", "☀": "sun", "★": "star", "✦": "sparkles",
};

/** Nombres semánticos que el modelo de IA puede devolver como `icon`. */
export const OBJECTIVE_ICON_NAMES = [
  "target", "rocket", "wrench", "trophy", "brain", "coins", "zap", "code",
  "briefcase", "puzzle", "graduation", "bookOpen", "compass", "flag",
] as const;

export function resolveIconName(value: string | undefined | null, fallback: IconName = "target"): IconName {
  if (!value) return fallback;
  const raw = value.trim();
  if (raw in ICONS) return raw as IconName;
  const stripped = raw.replace(/\uFE0F/g, "");
  for (const ch of Array.from(stripped)) {
    if (EMOJI_TO_ICON[ch]) return EMOJI_TO_ICON[ch];
  }
  return fallback;
}

/** Icono a partir de un nombre semántico o de un emoji heredado. */
export function Glyph({
  name,
  fallback,
  ...props
}: IconProps & { name: string | undefined | null; fallback?: IconName }) {
  return <Icon name={resolveIconName(name, fallback)} {...props} />;
}

/** Quita marcadores emoji iniciales ("✅ Texto") y devuelve icono + texto limpio. */
export function splitLeadingMarker(line: string): { icon: IconName | null; text: string } {
  const m = line.match(/^\s*((?:[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B50])\uFE0F?)\s*/u);
  if (!m) return { icon: null, text: line };
  return { icon: resolveIconName(m[1], "info"), text: line.slice(m[0].length) };
}
