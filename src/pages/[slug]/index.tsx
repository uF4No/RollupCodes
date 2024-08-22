import Avatar from '@components/Avatar'
import Layout from '@components/Layout'
import { AvatarSize, IDocMeta, Text, CustomChainSpec } from '@utils/types'
import { join } from 'path'
import fs from 'fs'
import getConfig from 'next/config'
import matter from 'gray-matter'
import { serialize } from 'next-mdx-remote/serialize'
import styles from './styles.module.scss'
import { MDXRemote } from 'next-mdx-remote'
import { Params } from 'next/dist/shared/lib/router/utils/route-matcher'
import MDXShortcodes from '@components/MDXShortcodes'
import remarkGfm from 'remark-gfm'
import DropdownLinks from '@components/DropdownLinks'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Feedback from '@components/Feedback'
import Hero from '@components/Hero'
import Typography from '@components/Typography'
import useLastModifiedDate from '@hooks/useLastModifiedDate'
const { serverRuntimeConfig } = getConfig()

type Path = { params: { slug: string } }

type Paths = Path[]

type StaticPathsResult = {
    paths: Paths
    fallback: boolean
}

type Content = {
    meta: IDocMeta
    mdxContent: {
        compiledSource: string
        frontmatter: Record<string, unknown>
        scope: Record<string, unknown>
    }
}

type StaticPropsResult = {
    props: {
        content: Content,
        chainSpec: CustomChainSpec
    }
}

type DocsContent = Record<string, Content>

interface IContent {
    content: Content,
    chainSpec: CustomChainSpec
}

export default function Details({ content, chainSpec }: IContent) {
    const router = useRouter()
    const [additionalPaddingTop, setAdditionalPaddingTop] = useState<
        number | undefined
    >(0)

    const lastModifiedDate = useLastModifiedDate(content?.meta?.slug)

    useEffect(() => {
        const script = document.createElement('script')

        script.src = '../js/details.js'
        script.async = true

        document.body.appendChild(script)

        return () => {
            document.body.removeChild(script)
        }
    }, [router.pathname])

    return (
        <Layout loading={!content} paddingTop={additionalPaddingTop}>
            <Hero getHeight={(height) => setAdditionalPaddingTop(height)}>
                <Avatar
                    size={AvatarSize.LARGE}
                    lightLogo={content?.meta?.lightLogo}
                    darkLogo={content?.meta?.darkLogo}
                    name={content?.meta?.title}
                />
                <DropdownLinks links={content?.meta?.links} />
            </Hero>
            <div className={styles.pageGrid}>
                <div id="sidebar" className={styles.sidebar} />
                <div className={styles.sidebar_placeholder} />
                <div id="markdown" className={styles.docContent}>
                    {lastModifiedDate && (
                        <Typography
                            variant={Text.BODY2}
                            fontWeight="400"
                            marginTop={46}
                            color={'var(--neutral50)'}
                        >
                            Last Updated {lastModifiedDate}
                        </Typography>
                    )}
                    <MDXRemote
                        {...content?.mdxContent}
                        components={MDXShortcodes}
                        scope={chainSpec}
                    />
                </div>
            </div>
            <Feedback />
        </Layout>
    )
}

const getDocsContent = async (): Promise<DocsContent> => {
    const folder = 'src/docs/'
    const path = join(serverRuntimeConfig.APP_ROOT, folder)
    const files = fs.readdirSync(path)
    const markdownDocs = files.filter((file) => file.endsWith('.mdx'))

    // Get gray-matter data from each file.
    const docs: Record<string, { meta: IDocMeta; mdxContent: any }> = {}

    await Promise.all(
        markdownDocs.map(async (fileName) => {
            const fileContents = fs.readFileSync(`${folder}${fileName}`, 'utf8')
            const { data, content } = matter(fileContents)
            const mdxContent = await serialize(content, {
                mdxOptions: { remarkPlugins: [remarkGfm] },
            })

            const hasDarkLogo = fs.existsSync(
                `public/images/${fileName.replace('.mdx', '')}-dark-logo.svg`
            )

            const meta = {
                title: data?.title,
                // Light logo will be used as default if there is ONLY one
                lightLogo: `../images/${fileName.replace('.mdx', '')}-logo.svg`,
                darkLogo: hasDarkLogo
                    ? `../images/${fileName.replace('.mdx', '')}-dark-logo.svg`
                    : '',
                subtitle: data?.subtitle,
                slug: fileName.replace('.mdx', ''),
                labels: data?.labels,
                links: data?.links,
            }

            docs[`${fileName.replace('.mdx', '')}`] = {
                meta,
                mdxContent,
            }
        })
    )

    return docs
}

const getChainSpec = async (network: string): Promise<CustomChainSpec> => {
    const folder = 'chain-specs/specifications/'

    const customChainSpec: CustomChainSpec = {
        opcodes: {},
        precompiles: {},
        system_contracts: {}
    }

    try {
        const fileContents = fs.readFileSync(`${folder}${network}.json`, 'utf8')
        const chainSpec = JSON.parse(fileContents)
        await Promise.all(chainSpec.forks.map(async (fork: CustomChainSpec) => {
            Object.entries(fork.opcodes).forEach(([opcode, data]) => {
                customChainSpec.opcodes[opcode] = data;
            })
            Object.entries(fork.precompiles).forEach(([precompile, data]) => {
                customChainSpec.precompiles[precompile] = data;
            })
            Object.entries(fork.system_contracts).forEach(([system_contract, data]) => {
                customChainSpec.system_contracts[system_contract] = data;
            })
        }))
    } catch (e) {}

    return customChainSpec
}

const getDocsPaths = (): Paths => {
    const folder = 'src/docs/'
    const path = join(serverRuntimeConfig.APP_ROOT, folder)
    const files = fs.readdirSync(path)
    const markdownDocs = files.filter((file) => file.endsWith('.mdx'))

    // Get gray-matter data from each file.
    const paths: Paths = []

    markdownDocs?.map((fileName) => {
        paths.push({ params: { slug: fileName.replace('.mdx', '') } })
    })

    return paths
}

export async function getStaticPaths(): Promise<StaticPathsResult> {
    const paths = getDocsPaths()

    return { paths, fallback: false }
}

export async function getStaticProps({
    params,
}: Params): Promise<StaticPropsResult> {
    const { slug } = params

    const contents = await getDocsContent()
    const content = contents[slug]
    const [chainSpec, ethChainSpec] = await Promise.all([getChainSpec(slug), getChainSpec('ethereum')])

    // Merge the specifications
    Object.entries(ethChainSpec.opcodes).forEach(([op, data]) => {
        if (!chainSpec.opcodes[op]) {
            chainSpec.opcodes[op] = { name: data.name }
        }
        chainSpec.opcodes[op].ethDescription = data.description
    })
    Object.entries(ethChainSpec.precompiles).forEach(([address, data]) => {
        if (!chainSpec.precompiles[address]) {
            chainSpec.precompiles[address] = { name: data.name }
        }
        chainSpec.precompiles[address].ethDescription = data.description
    })
    Object.entries(ethChainSpec.system_contracts).forEach(([address, data]) => {
        if (!chainSpec.system_contracts[address]) {
            chainSpec.system_contracts[address] = { name: data.name }
        }
        chainSpec.system_contracts[address].ethDescription = data.description
    })

    return { props: { content, chainSpec } }
}
