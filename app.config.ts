export default defineAppConfig({
  ui: {
    primary: 'gray',
    gray: 'neutral',
    button: {
      default: {
        size: 'md',
        color: 'gray',
        variant: 'ghost'
      }
    },
    input: {
      default: {
        size: 'md',
        color: 'gray',
        variant: 'outline',
        padding: 'px-4 py-2',
        ring: 'ring-1 ring-gray-200 focus:ring-2 focus:ring-gray-400',
        rounded: 'rounded-lg',
        placeholder: 'placeholder-gray-400'
      }
    },
    select: {
      default: {
        size: 'md',
        color: 'gray',
        variant: 'outline',
        padding: 'px-4 py-2',
        ring: 'ring-1 ring-gray-200 focus:ring-2 focus:ring-gray-400',
        rounded: 'rounded-lg',
        placeholder: 'placeholder-gray-400'
      }
    },
    notification: {
      default: {
        color: 'gray'
      }
    }
  }
}) 